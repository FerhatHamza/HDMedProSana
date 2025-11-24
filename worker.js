/**
 * MedProSana Cloudflare Worker Backend
 * Fixed Version: Handles /api routing correctly and uses created_at timestamps.
 */

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  const DEFAULT_PROTOCOL = {
    dialyzer: "F8HPS",
    access: "Fistula",
    dialysateFlow: "500 ml/min",
    bloodFlow: "300 ml/min",
    duration: "4 hours"
  };
  
  async function executeQuery(db, sql, params = []) {
    try {
        const stmt = db.prepare(sql).bind(...params);
        return await stmt.all();
    } catch (error) {
        console.error("D1 Query Error:", error);
        throw new Error(`Database error: ${error.message}`);
    }
  }
  
  async function handleRequest(request, env) {
    const url = new URL(request.url);
    let pathSegments = url.pathname.split('/').filter(Boolean);
  
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
    }
  
    if (pathSegments[0] !== 'api') {
        return new Response('Not Found', { status: 404, headers });
    }
  
    // --- FIX: Remove 'api' from path ---
    pathSegments = pathSegments.slice(1);
    // ----------------------------------
  
    try {
        // 1. /api/patients
        if (pathSegments.length === 1 && pathSegments[0] === 'patients') {
            if (request.method === 'GET') {
                const result = await executeQuery(env.DB, 'SELECT * FROM Patients ORDER BY familyname ASC');
                return new Response(JSON.stringify({ patients: result.results }), { status: 200, headers });
            }
            if (request.method === 'POST') {
                const data = await request.json();
                const { name, familyname, birthdate } = data;
                if (!name || !familyname || !birthdate) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers });
  
                const sql = 'INSERT INTO Patients (name, familyname, birthdate) VALUES (?, ?, ?)';
                const result = await executeQuery(env.DB, sql, [name, familyname, birthdate]);
                const patientId = result.meta.last_row_id;
  
                await executeQuery(env.DB, 
                    'INSERT INTO Protocols (patient_id, dialyzer, access, dialysateFlow, bloodFlow, duration, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                    [patientId, DEFAULT_PROTOCOL.dialyzer, DEFAULT_PROTOCOL.access, DEFAULT_PROTOCOL.dialysateFlow, DEFAULT_PROTOCOL.bloodFlow, DEFAULT_PROTOCOL.duration]
                );
                return new Response(JSON.stringify({ patient: { id: patientId, name, familyname, birthdate } }), { status: 201, headers });
            }
        }
  
        // 2. /api/patients/:id routes
        const patientId = pathSegments[1];
        if (pathSegments.length >= 2 && pathSegments[0] === 'patients' && !isNaN(parseInt(patientId))) {
            const id = parseInt(patientId);
  
            if (pathSegments.length === 2 && request.method === 'GET') {
                const result = await executeQuery(env.DB, 'SELECT * FROM Patients WHERE id = ?', [id]);
                if (result.results.length === 0) return new Response(JSON.stringify({ error: 'Patient not found' }), { status: 404, headers });
                return new Response(JSON.stringify({ patient: result.results[0] }), { status: 200, headers });
            }
  
            // Medications
            if (pathSegments.length === 3 && pathSegments[2] === 'medications') {
                if (request.method === 'GET') {
                    const result = await executeQuery(env.DB, 'SELECT * FROM Medications WHERE patient_id = ? ORDER BY created_at DESC', [id]);
                    return new Response(JSON.stringify({ medications: result.results }), { status: 200, headers });
                }
                if (request.method === 'POST') {
                    const data = await request.json();
                    if (!data.name || !data.dosage) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers });
                    await executeQuery(env.DB, 'INSERT INTO Medications (patient_id, name, dosage, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', [id, data.name, data.dosage]);
                    return new Response(JSON.stringify({ success: true }), { status: 201, headers });
                }
            }
  
            // Labs
            if (pathSegments.length === 3 && pathSegments[2] === 'labs') {
                if (request.method === 'GET') {
                    const result = await executeQuery(env.DB, 'SELECT * FROM LabResults WHERE patient_id = ? ORDER BY created_at DESC', [id]);
                    return new Response(JSON.stringify({ labResults: result.results }), { status: 200, headers });
                }
                if (request.method === 'POST') {
                    const data = await request.json();
                    if (!data.name || !data.result) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers });
                    await executeQuery(env.DB, 'INSERT INTO LabResults (patient_id, name, result, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', [id, data.name, data.result]);
                    return new Response(JSON.stringify({ success: true }), { status: 201, headers });
                }
            }
  
            // Protocol
            if (pathSegments.length === 3 && pathSegments[2] === 'protocol') {
                if (request.method === 'GET') {
                    const result = await executeQuery(env.DB, 'SELECT * FROM Protocols WHERE patient_id = ?', [id]);
                    return new Response(JSON.stringify({ protocol: result.results[0] || {} }), { status: 200, headers });
                }
                if (request.method === 'PUT') {
                    const data = await request.json();
                    const sql = `UPDATE Protocols SET dialyzer = ?, access = ?, dialysateFlow = ?, bloodFlow = ?, duration = ?, updated_at = CURRENT_TIMESTAMP WHERE patient_id = ?`;
                    await executeQuery(env.DB, sql, [data.dialyzer, data.access, data.dialysateFlow, data.bloodFlow, data.duration, id]);
                    return new Response(null, { status: 204, headers });
                }
            }
        }
        return new Response(JSON.stringify({ error: 'Route not found' }), { status: 404, headers });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Internal Server Error', message: error.message }), { status: 500, headers });
    }
  }
  
  export default {
    async fetch(request, env) { return handleRequest(request, env); },
  };
