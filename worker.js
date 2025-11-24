/**
 * MedProSana Cloudflare Worker Backend
 * * This worker uses the D1 database binding named 'DB' to handle CRUD operations.
 * It uses a simple path-based router.
 */

// Define response headers for CORS and content type
const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// Default Protocol for new patients
const DEFAULT_PROTOCOL = {
    dialyzer: "F8HPS",
    access: "Fistula",
    dialysateFlow: "500 ml/min",
    bloodFlow: "300 ml/min",
    duration: "4 hours"
};

/**
 * Executes a D1 statement and handles the response/errors.
 * @param {D1Database} db The D1 binding.
 * @param {string} sql The SQL query string.
 * @param {Array<any>} params Parameters for the query.
 */
async function executeQuery(db, sql, params = []) {
    try {
        const stmt = db.prepare(sql).bind(...params);
        return await stmt.all();
    } catch (error) {
        console.error("D1 Query Error:", error);
        throw new Error(`Database error: ${error.message}`);
    }
}

// Router function to handle different API endpoints
async function handleRequest(request, env) {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/').filter(Boolean); // e.g., ['api', 'patients', '1', 'medications']

    // Handle OPTIONS request for CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
    }

    if (pathSegments[0] !== 'api') {
        return new Response('Not Found', { status: 404, headers });
    }

    try {
        // --- 1. /api/patients (GET, POST) ---
        if (pathSegments.length === 1 && pathSegments[0] === 'patients') {
            if (request.method === 'GET') {
                const result = await executeQuery(env.DB, 'SELECT * FROM Patients ORDER BY familyname ASC');
                return new Response(JSON.stringify({ patients: result.results }), { status: 200, headers });
            }
            if (request.method === 'POST') {
                const data = await request.json();
                const { name, familyname, birthdate } = data;

                if (!name || !familyname || !birthdate) {
                    return new Response(JSON.stringify({ error: 'Missing required patient fields' }), { status: 400, headers });
                }

                const sql = 'INSERT INTO Patients (name, familyname, birthdate) VALUES (?, ?, ?)';
                const result = await executeQuery(env.DB, sql, [name, familyname, birthdate]);
                const patientId = result.meta.last_row_id;

                // Insert default protocol (MANDATORY for detail view to work)
                await executeQuery(env.DB, 
                    'INSERT INTO Protocols (patient_id, dialyzer, access, dialysateFlow, bloodFlow, duration) VALUES (?, ?, ?, ?, ?, ?)',
                    [patientId, DEFAULT_PROTOCOL.dialyzer, DEFAULT_PROTOCOL.access, DEFAULT_PROTOCOL.dialysateFlow, DEFAULT_PROTOCOL.bloodFlow, DEFAULT_PROTOCOL.duration]
                );

                const newPatient = { id: patientId, name, familyname, birthdate };
                return new Response(JSON.stringify({ patient: newPatient }), { status: 201, headers });
            }
        }

        // Check for patient ID in path
        const patientId = pathSegments[1];
        if (pathSegments.length >= 2 && !isNaN(parseInt(patientId))) {
            const id = parseInt(patientId);

            // --- 2. /api/patients/:id (GET) ---
            if (pathSegments.length === 2 && pathSegments[0] === 'patients' && request.method === 'GET') {
                const result = await executeQuery(env.DB, 'SELECT * FROM Patients WHERE id = ?', [id]);
                if (result.results.length === 0) {
                    return new Response(JSON.stringify({ error: 'Patient not found' }), { status: 404, headers });
                }
                return new Response(JSON.stringify({ patient: result.results[0] }), { status: 200, headers });
            }

            // --- 3. /api/patients/:id/medications (GET, POST) ---
            if (pathSegments.length === 3 && pathSegments[2] === 'medications') {
                if (request.method === 'GET') {
                    const result = await executeQuery(env.DB, 'SELECT * FROM Medications WHERE patient_id = ? ORDER BY date DESC', [id]);
                    return new Response(JSON.stringify({ medications: result.results }), { status: 200, headers });
                }
                if (request.method === 'POST') {
                    const data = await request.json();
                    const { name, dosage } = data;
                    if (!name || !dosage) {
                        return new Response(JSON.stringify({ error: 'Missing medication fields' }), { status: 400, headers });
                    }
                    const sql = 'INSERT INTO Medications (patient_id, name, dosage, date) VALUES (?, ?, ?, strftime(\'%Y-%m-%d\', \'now\'))';
                    await executeQuery(env.DB, sql, [id, name, dosage]);
                    return new Response(JSON.stringify({ success: true }), { status: 201, headers });
                }
            }

            // --- 4. /api/patients/:id/labs (GET, POST) ---
            if (pathSegments.length === 3 && pathSegments[2] === 'labs') {
                if (request.method === 'GET') {
                    const result = await executeQuery(env.DB, 'SELECT * FROM LabResults WHERE patient_id = ? ORDER BY date DESC', [id]);
                    return new Response(JSON.stringify({ labResults: result.results }), { status: 200, headers });
                }
                if (request.method === 'POST') {
                    const data = await request.json();
                    const { name, result: labResult } = data;
                    if (!name || !labResult) {
                        return new Response(JSON.stringify({ error: 'Missing lab result fields' }), { status: 400, headers });
                    }
                    const sql = 'INSERT INTO LabResults (patient_id, name, result, date) VALUES (?, ?, ?, strftime(\'%Y-%m-%d\', \'now\'))';
                    await executeQuery(env.DB, sql, [id, name, labResult]);
                    return new Response(JSON.stringify({ success: true }), { status: 201, headers });
                }
            }

            // --- 5. /api/patients/:id/protocol (GET, PUT) ---
            if (pathSegments.length === 3 && pathSegments[2] === 'protocol') {
                if (request.method === 'GET') {
                    const result = await executeQuery(env.DB, 'SELECT * FROM Protocols WHERE patient_id = ?', [id]);
                    const protocol = result.results.length > 0 ? result.results[0] : {};
                    // Ensure updated_at is a proper date string for the front-end
                    return new Response(JSON.stringify({ protocol }), { status: 200, headers });
                }
                if (request.method === 'PUT') {
                    const data = await request.json();
                    const { dialyzer, access, dialysateFlow, bloodFlow, duration } = data;

                    const sql = `
                        UPDATE Protocols 
                        SET dialyzer = ?, access = ?, dialysateFlow = ?, bloodFlow = ?, duration = ?, updated_at = CURRENT_TIMESTAMP 
                        WHERE patient_id = ?
                    `;
                    await executeQuery(env.DB, sql, [dialyzer, access, dialysateFlow, bloodFlow, duration, id]);
                    return new Response(null, { status: 204, headers }); // No content
                }
            }
        }

        return new Response(JSON.stringify({ error: 'Route not found' }), { status: 404, headers });

    } catch (error) {
        console.error('Unhandled Worker Error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error', message: error.message }), { status: 500, headers });
    }
}

export default {
    async fetch(request, env) {
        return handleRequest(request, env);
    },
};

