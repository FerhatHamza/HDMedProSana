// IMPORTANT: Use window.onload to ensure the DOM is fully loaded before trying to find and bind elements.

// --- Configuration and State ---
let state = {
    view: 'list',
    currentPatient: null,
    currentTab: 'info',
    patientList: [],
    isLoading: false,
};

// IMPORTANT: Keep your worker URL here
// This is the endpoint your Cloudflare Worker is deployed to.
const API_BASE = 'https://hdmedprosana-api.ferhathamza17.workers.dev/api'; 
const statusIndicator = document.getElementById('api-status-indicator');

// --- UTILITY FUNCTIONS ---

/**
 * Updates the API status indicator on the UI.
 * @param {string} message - The message to display.
 * @param {'info' | 'success' | 'error'} type - The type of message.
 */
function updateStatusIndicator(message, type = 'info') {
    const indicator = document.getElementById('api-status-indicator');
    if (!indicator) return;

    indicator.textContent = message;
    indicator.className = 'p-2 mb-4 text-sm rounded-lg';
    indicator.classList.remove('hidden');

    switch (type) {
        case 'success':
            indicator.classList.add('text-green-700', 'bg-green-100');
            break;
        case 'error':
            indicator.classList.add('text-red-700', 'bg-red-100', 'font-bold');
            break;
        case 'info':
        default:
            indicator.classList.add('text-blue-700', 'bg-blue-100');
            break;
    }
}

/**
 * Shows a temporary toast message.
 * @param {string} text - The message content.
 * @param {'success' | 'error' | 'warning'} type - The type of message.
 */
function showMessage(text, type = 'success') {
    const box = document.getElementById('message-box');
    if (!box) return;

    const bgColor = type === 'error' ? 'bg-red-500' : (type === 'warning' ? 'bg-yellow-500' : 'bg-green-500');

    const toast = document.createElement('div');
    toast.className = `${bgColor} text-white px-4 py-3 rounded-lg shadow-lg mb-3 max-w-sm transition-all duration-300 transform translate-x-0`;
    toast.innerHTML = `<div class="font-medium">${text}</div>`;
    box.prepend(toast);

    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Opens a modal window.
 * @param {string} modalId - The ID of the modal element.
 */
function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('modal-active');
    document.getElementById(modalId)?.classList.remove('invisible', 'opacity-0');
}

/**
 * Closes a modal window.
 * @param {string} modalId - The ID of the modal element.
 */
function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('modal-active');
    document.getElementById(modalId)?.classList.add('invisible', 'opacity-0');
}

/**
 * Calculates the age from a birthdate string.
 * @param {string} birthdateString - Date of birth in 'YYYY-MM-DD' format.
 * @returns {number|string} - Age in years or 'N/A'.
 */
function calculateAge(birthdateString) {
    if (!birthdateString) return 'N/A';
    const birthDate = new Date(birthdateString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

// --- API HANDLERS ---

/**
 * Generic function for fetching data from the worker API.
 * Includes loading state management and error handling.
 */
async function apiFetch(url, method = 'GET', data = null) {
    state.isLoading = true;
    renderApp();

    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (data) {
            options.body = JSON.stringify(data);
        }

        const fullUrl = `${API_BASE}${url}`;
        const response = await fetch(fullUrl, options);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}.`);
        }

        if (url === '/patients' && method === 'GET') {
            updateStatusIndicator(`Connection successful. Worker is responsive.`, 'success');
        }

        if (response.status === 204 || method === 'PUT' || method === 'DELETE') {
             return { success: true };
        }

        return await response.json();

    } catch (error) {
        console.error("API Call Failed:", error);
        const errorMessage = error.message || `Network error.`;
        showMessage(errorMessage, 'error');
        
        if (url === '/patients' && method === 'GET') {
            updateStatusIndicator(`API Connection FAILED: ${errorMessage}`, 'error');
        }
        return null;

    } finally {
        state.isLoading = false;
    }
}

/**
 * Fetches the list of all patients and updates the application state.
 */
async function fetchPatients() {
    const result = await apiFetch('/patients');
    if (result && result.patients) {
        state.patientList = result.patients.sort((a, b) => (a.familyname || '').localeCompare(b.familyname || ''));
         if (state.view === 'detail' && state.currentPatient) {
            // If viewing detail, refresh the detail view with the latest data
            const updatedPatient = state.patientList.find(p => p.id === state.currentPatient.id);
            if (updatedPatient) {
                await fetchPatientDetail(updatedPatient.id);
            }
        }
        renderApp();
    } else if (result) {
        // Handle case where API is up but returns no patients
        state.patientList = [];
        renderApp();
    }
}

/**
 * Fetches detailed records for a specific patient.
 * @param {number} patientId - The ID of the patient.
 */
async function fetchPatientDetail(patientId) {
    // Fetch all records concurrently for faster load time
    const [patientRes, medsRes, labsRes, protocolRes, sessionsRes] = await Promise.all([
        apiFetch(`/patients/${patientId}`),
        apiFetch(`/patients/${patientId}/medications`),
        apiFetch(`/patients/${patientId}/labs`),
        apiFetch(`/patients/${patientId}/protocol`),
        apiFetch(`/patients/${patientId}/sessions`), 
    ]);

    if (patientRes) {
        // Combine all fetched data into the currentPatient object
        state.currentPatient = {
            ...patientRes.patient,
            medications: (medsRes?.medications || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
            labResults: (labsRes?.labResults || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
            protocol: protocolRes?.protocol || {},
            sessions: (sessionsRes?.sessions || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
        };
        renderApp();
    } else {
        showMessage("Patient failed to load. Returning to list view.", 'error');
        state.view = 'list';
        state.currentPatient = null;
        fetchPatients();
    }
}

/**
 * Adds a new patient to the database.
 * @param {object} patientData - The new patient data.
 */
async function addPatient(patientData) {
    const result = await apiFetch('/patients', 'POST', patientData);
    if (result && result.patient) {
        showMessage(`${patientData.name} ${patientData.familyname} added successfully.`);
        closeModal('patient-modal');
        await fetchPatients();
    }
}

/**
 * Adds a new record (medication, lab, or session) for a patient.
 * @param {number} patientId - The ID of the patient.
 * @param {'medications' | 'labs' | 'sessions'} type - The type of record to add.
 * @param {object} record - The record data.
 */
async function addPatientRecord(patientId, type, record) {
    const url = `/patients/${patientId}/${type}`; 
    const result = await apiFetch(url, 'POST', record);
    if (result && result.success) {
        showMessage(`New entry added to ${type}.`);
        await fetchPatientDetail(patientId);
    }
}

/**
 * Updates the patient's hemodialysis protocol.
 * @param {number} patientId - The ID of the patient.
 * @param {object} protocolData - The new protocol data.
 */
async function updatePatientProtocol(patientId, protocolData) {
    const result = await apiFetch(`/patients/${patientId}/protocol`, 'PUT', protocolData);
    if (result && result.success) {
        showMessage("Hemodialysis Protocol updated.");
        await fetchPatientDetail(patientId);
    }
}

// --- PROMPT/INPUT FUNCTIONS ---

/**
 * Prompts the user for data to add a new record.
 * @param {'meds' | 'labs' | 'sessions'} type - The record type.
 */
function showAddRecordPrompt(type) {
    if (!state.currentPatient) return;
    const patientId = state.currentPatient.id;

    if (type === 'meds') {
        const medName = prompt("Medication Name (e.g., EPO, Heparin):");
        const medDosage = prompt("Dosage/Frequency:");
        if (medName && medDosage) {
            addPatientRecord(patientId, 'medications', { name: medName, dosage: medDosage });
        }
    } else if (type === 'labs') {
        const labName = prompt("Lab Test Name (e.g., Potassium, Urea):");
        const labResult = prompt("Result Value:");
        if (labName && labResult) {
            addPatientRecord(patientId, 'labs', { name: labName, result: labResult });
        }
    } else if (type === 'sessions') {
        // Note: Using prompt() for simplicity, in a production app a custom modal form would be used.
        const preW = prompt("Poids AVANT (kg):");
        if (preW === null) return;
        const postW = prompt("Poids APRÈS (kg):");
        if (postW === null) return;
        const preBP = prompt("Tension AVANT (ex: 130/80):");
        if (preBP === null) return;
        const postBP = prompt("Tension APRÈS:");
        if (postBP === null) return;
        const access = prompt("État de l'abord (Fistule/KT):", "Bon état");
        if (access === null) return;
        const note = prompt("Observations / Incidents:");
        if (note === null) return;

        addPatientRecord(patientId, 'sessions', {
            pre_weight: preW,
            post_weight: postW,
            pre_bp: preBP,
            post_bp: postBP,
            access_condition: access,
            notes: note
        });
    }
}

/**
 * Prompts the user to edit the hemodialysis protocol.
 */
function showProtocolEditPrompt() {
    const p = state.currentPatient.protocol || {};
    const patientId = state.currentPatient.id;

    const newDialyzer = prompt(`Edit Dialyzer:`, p.dialyzer || "F8HPS");
    if (newDialyzer === null) return;
    const newAccess = prompt(`Edit Vascular Access:`, p.access || "Fistula");
    if (newAccess === null) return;
    const newDialysateFlow = prompt(`Edit Dialysate Flow:`, p.dialysateFlow || "500 ml/min");
    if (newDialysateFlow === null) return;
    const newBloodFlow = prompt(`Edit Blood Flow:`, p.bloodFlow || "300 ml/min");
    if (newBloodFlow === null) return;
    const newDuration = prompt(`Edit Duration:`, p.duration || "4 hours");
    if (newDuration === null) return;

    updatePatientProtocol(patientId, {
        dialyzer: newDialyzer,
        access: newAccess,
        dialysateFlow: newDialysateFlow,
        bloodFlow: newBloodFlow,
        duration: newDuration
    });
}

// --- PRINTING FUNCTIONS ---

/**
 * Prints the document. Creates an isolated window with the printable content.
 * @param {string} title - Title for the print document.
 * @param {string} contentHtml - HTML content to print.
 */
function executePrint(title, contentHtml) {
    const printWindow = window.open('', '', 'height=600,width=800');
    if (!printWindow) {
        showMessage("Printer popup blocked. Please allow popups for this site.", 'error');
        return;
    }

    // Include the main stylesheet link to inherit styles, especially print media queries
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = document.querySelector('link[rel="stylesheet"]').href || ''; // If using an external stylesheet
    
    // Fallback for Tailwind classes (re-importing Tailwind is easiest)
    const twScript = '<script src="https://cdn.tailwindcss.com"></script>';

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title}</title>
            ${twScript}
            <style>
                @media print {
                    /* Ensure clean print layout in the new window */
                    @page { margin: 1cm; }
                    body { font-family: 'Inter', sans-serif; }
                }
            </style>
        </head>
        <body class="p-8">
            ${contentHtml}
        </body>
        </html>
    `);

    printWindow.document.close();
    
    // Wait for content (and potentially Tailwind/CSS) to load before printing
    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    }, 500); // 500ms delay to ensure rendering is complete
}

/**
 * Generates the HTML content for various printable documents.
 * @param {'demographics' | 'protocol' | 'medications' | 'labs'} type - The type of document to generate.
 */
function generatePrintableDocument(type) {
    const p = state.currentPatient;
    if (!p) return;
    
    const fullName = `${p.name} ${p.familyname}`;
    let title = `MedProSana - Print Document`;
    let content = '';

    // Header shared by all printouts
    const printHeader = (docTitle) => `
        <div class="mb-8 border-b border-gray-300 pb-4">
            <h1 class="text-3xl font-extrabold text-emerald-600 mb-2">MedProSana Clinic</h1>
            <h2 class="text-xl font-semibold text-gray-700">${docTitle}</h2>
            <p class="text-sm text-gray-500 mt-1">Patient: ${fullName} (ID: ${p.id}) | Date: ${new Date().toLocaleDateString()}</p>
        </div>
    `;

    switch (type) {
        case 'demographics':
            title = `Demographics - ${fullName}`;
            content = printHeader('Patient Demographics & Basic Information');
            content += `
                <div class="space-y-4">
                    <div class="flex border-b pb-2"><p class="w-1/3 font-medium">Full Name:</p><p class="w-2/3">${fullName}</p></div>
                    <div class="flex border-b pb-2"><p class="w-1/3 font-medium">Date of Birth:</p><p class="w-2/3">${p.birthdate}</p></div>
                    <div class="flex border-b pb-2"><p class="w-1/3 font-medium">Age:</p><p class="w-2/3">${calculateAge(p.birthdate)} years</p></div>
                </div>
                <div class="mt-8">
                    <h3 class="text-lg font-semibold border-b pb-1 mb-3">Hemodialysis Protocol Summary</h3>
                    <div class="space-y-2 text-sm">
                        <p><strong>Dialyzer:</strong> ${p.protocol.dialyzer || 'N/A'}</p>
                        <p><strong>Vascular Access:</strong> ${p.protocol.access || 'N/A'}</p>
                        <p><strong>Duration:</strong> ${p.protocol.duration || 'N/A'}</p>
                    </div>
                </div>
            `;
            break;

        case 'protocol':
            title = `HD Protocol - ${fullName}`;
            content = printHeader('Hemodialysis Prescription Protocol');
            const protocol = p.protocol || {};
            content += `
                <div class="space-y-4 text-base">
                    <div class="flex border-b pb-2"><p class="w-1/3 font-medium text-blue-700">Dialyzer Model:</p><p class="w-2/3">${protocol.dialyzer || 'N/A'}</p></div>
                    <div class="flex border-b pb-2"><p class="w-1/3 font-medium text-blue-700">Vascular Access:</p><p class="w-2/3">${protocol.access || 'N/A'}</p></div>
                    <div class="flex border-b pb-2"><p class="w-1/3 font-medium">Dialysate Flow Rate:</p><p class="w-2/3">${protocol.dialysateFlow || 'N/A'}</p></div>
                    <div class="flex border-b pb-2"><p class="w-1/3 font-medium">Blood Flow Rate:</p><p class="w-2/3">${protocol.bloodFlow || 'N/A'}</p></div>
                    <div class="flex border-b pb-2"><p class="w-1/3 font-medium">Duration per Session:</p><p class="w-2/3">${protocol.duration || 'N/A'}</p></div>
                </div>
            `;
            break;

        case 'medications':
            title = `Medication List - ${fullName}`;
            content = printHeader('Current Medication Ordinance');
            if (p.medications.length === 0) {
                content += '<p class="text-gray-500">No medications recorded.</p>';
            } else {
                const medsHtml = p.medications.map(m => `
                    <tr class="border-b">
                        <td class="px-4 py-2">${new Date(m.created_at).toISOString().substring(0, 10)}</td>
                        <td class="px-4 py-2 font-medium">${m.name}</td>
                        <td class="px-4 py-2">${m.dosage}</td>
                    </tr>
                `).join('');
                content += `
                    <table class="min-w-full bg-white border border-gray-200 shadow-md rounded-lg">
                        <thead class="bg-gray-100">
                            <tr>
                                <th class="px-4 py-2 text-left text-sm font-semibold">Date Added</th>
                                <th class="px-4 py-2 text-left text-sm font-semibold">Medication Name</th>
                                <th class="px-4 py-2 text-left text-sm font-semibold">Dosage / Frequency</th>
                            </tr>
                        </thead>
                        <tbody>${medsHtml}</tbody>
                    </table>
                `;
            }
            break;

        case 'labs':
            title = `Lab Demand/Results - ${fullName}`;
            content = printHeader('Lab Analysis Demand & Results History');
            if (p.labResults.length === 0) {
                content += '<p class="text-gray-500">No lab results recorded.</p>';
            } else {
                const labsHtml = p.labResults.map(l => `
                    <tr class="border-b">
                        <td class="px-4 py-2">${new Date(l.created_at).toISOString().substring(0, 10)}</td>
                        <td class="px-4 py-2 font-medium">${l.name}</td>
                        <td class="px-4 py-2 text-blue-700 font-bold">${l.result}</td>
                    </tr>
                `).join('');
                content += `
                    <table class="min-w-full bg-white border border-gray-200 shadow-md rounded-lg">
                        <thead class="bg-gray-100">
                            <tr>
                                <th class="px-4 py-2 text-left text-sm font-semibold">Date</th>
                                <th class="px-4 py-2 text-left text-sm font-semibold">Test Name</th>
                                <th class="px-4 py-2 text-left text-sm font-semibold">Result Value</th>
                            </tr>
                        </thead>
                        <tbody>${labsHtml}</tbody>
                    </table>
                `;
            }
            break;
    }

    executePrint(title, content);
}


// --- RENDERING FUNCTIONS ---

/**
 * Main rendering function, determines which view to display.
 */
function renderApp() {
    const container = document.getElementById('content-container');
    if (!container) return; 

    // Show loading state if data is being fetched and we are not in a detail view refresh
    if (state.isLoading && !state.currentPatient) { 
        container.innerHTML = `
            <div class="text-center p-12 text-gray-500">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto"></div>
                <h3 class="mt-4 text-lg font-medium text-gray-900">Loading Data...</h3>
            </div>
        `;
        return;
    }

    if (state.view === 'list') {
        renderPatientList(container);
    } else if (state.view === 'detail' && state.currentPatient) {
        renderPatientDetail(container);
    }
}

/**
 * Renders the list of all patients.
 */
function renderPatientList(container) {
    if (state.patientList.length === 0) {
        container.innerHTML = `<div class="text-center p-12 text-gray-500 border border-dashed border-gray-300 rounded-xl mt-8">
            <h3 class="mt-2 text-xl font-semibold text-gray-900">No Patients Registered</h3>
            <p class="mt-1 text-base text-gray-500">Add your first patient to begin.</p>
        </div>`;
        return;
    }

    const listHtml = state.patientList.map(p => {
        const age = calculateAge(p.birthdate);
        return `
            <div data-patient-id="${p.id}" class="bg-white p-4 rounded-xl shadow-md hover:shadow-lg transition cursor-pointer border-l-4 border-emerald-500">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-lg font-bold text-gray-800">${p.name} ${p.familyname}</p>
                        <p class="text-sm text-gray-500">DOB: ${p.birthdate} (${age} yrs)</p>
                    </div>
                    <div class="text-right">
                        <span class="text-xs font-semibold inline-block py-1 px-3 uppercase rounded-full text-blue-600 bg-blue-100">Dialysis</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <h2 class="text-2xl font-semibold text-gray-800 mb-6">Patient Roster</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${listHtml}</div>
    `;
}

/**
 * Renders the detailed view of a single patient.
 */
function renderPatientDetail(container) {
    const p = state.currentPatient;
    const fullName = `${p.name} ${p.familyname}`;
    const age = calculateAge(p.birthdate);
    
    const tabs = [
        { id: 'info', name: 'Demographics' },
        { id: 'sessions', name: 'Dialysis Sessions' },
        { id: 'meds', name: 'Medications' },
        { id: 'labs', name: 'Lab Results' },
        { id: 'protocol', name: 'HD Protocol' }
    ];

    let tabContentHtml = '';
    const meds = p.medications || [];
    const labs = p.labResults || [];
    const sessions = p.sessions || [];
    const protocol = p.protocol || {};

    const renderRecords = (records, type) => {
         if (records.length === 0) return `<p class="text-center text-gray-500 p-8 bg-white rounded-lg">No records found.</p>`;
         return records.map(r => `
             <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                 <div class="flex justify-between items-center">
                     <p class="text-base font-semibold text-gray-800">${r.name}</p>
                     <span class="text-xs text-gray-500">${r.date || new Date(r.created_at).toISOString().substring(0, 10)}</span>
                 </div>
                 <p class="text-sm text-gray-600 mt-1">${type === 'medications' ? `Dosage: <b>${r.dosage}</b>` : `Result: <b class="text-blue-600">${r.result}</b>`}</p>
             </div>
         `).join('');
    };

    const renderSessions = (sessions) => {
        if (sessions.length === 0) return `<p class="text-center text-gray-500 p-8 bg-white rounded-lg">No dialysis sessions recorded yet.</p>`;
        return sessions.map(s => {
            const preW = parseFloat(s.pre_weight);
            const postW = parseFloat(s.post_weight);
            const loss = (preW && postW) ? (preW - postW).toFixed(2) : 'N/A';
            return `
            <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-3">
                <div class="flex justify-between items-center border-b pb-2 mb-2">
                    <span class="font-bold text-gray-800">Date: ${s.date || new Date(s.created_at).toISOString().substring(0, 10)}</span>
                    <span class="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full">${s.access_condition || 'Access OK'}</span>
                </div>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <p class="text-gray-500">Weight (Pre/Post)</p>
                        <p class="font-medium">${s.pre_weight || '-'} kg / ${s.post_weight || '-'} kg</p>
                        <p class="text-xs text-blue-600">Loss: ${loss} kg</p>
                    </div>
                    <div>
                        <p class="text-gray-500">Blood Pressure</p>
                        <p class="font-medium">${s.pre_bp || '-'} / ${s.post_bp || '-'}</p>
                    </div>
                </div>
                ${s.notes ? `<div class="mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded">Note: ${s.notes}</div>` : ''}
            </div>`;
        }).join('');
    };

    switch (state.currentTab) {
        case 'info':
            tabContentHtml = `
                <div class="flex justify-end mb-4 print-hidden space-x-2">
                    <button data-print-type="medications" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium text-sm shadow-md">Print Ordinance</button>
                    <button data-print-type="demographics" class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium text-sm shadow-md">Print Info</button>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="text-sm text-gray-500">Full Name</p>
                        <p class="text-lg font-medium text-gray-800">${fullName}</p>
                    </div>
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="text-sm text-gray-500">Age / DOB</p>
                        <p class="text-lg font-medium text-gray-800">${age} yrs (${p.birthdate})</p>
                    </div>
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="text-sm text-gray-500">ID</p>
                        <p class="text-sm font-medium text-gray-800 break-all">${p.id}</p>
                    </div>
                </div>`;
            break;
        case 'sessions':
            tabContentHtml = `
                <div class="flex justify-end mb-4 print-hidden">
                    <button data-add-record="sessions" class="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition font-medium text-sm shadow-md">+ New Session</button>
                </div>
                <div class="space-y-3">
                    ${renderSessions(sessions)}
                </div>`;
            break;
        case 'meds':
            tabContentHtml = `
                <div class="flex justify-end mb-4 print-hidden space-x-2">
                    <button data-print-type="medications" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium text-sm shadow-md">Print Ordinance</button>
                    <button data-add-record="meds" class="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition font-medium text-sm shadow-md">+ Add Medication</button>
                </div>
                <div class="space-y-3">${renderRecords(meds, 'medications')}</div>`;
            break;
        case 'labs':
            tabContentHtml = `
                <div class="flex justify-end mb-4 print-hidden space-x-2">
                    <button data-print-type="labs" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium text-sm shadow-md">Print Lab Demand</button>
                    <button data-add-record="labs" class="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition font-medium text-sm shadow-md">+ Add Lab Result</button>
                </div>
                <div class="space-y-3">${renderRecords(labs, 'labs')}</div>`;
            break;
        case 'protocol':
            tabContentHtml = `
                <div class="flex justify-end mb-4 print-hidden space-x-2">
                    <button data-print-type="protocol" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium text-sm shadow-md">Print Protocol</button>
                    <button id="edit-protocol-btn" class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium text-sm shadow-md">Edit Protocol</button>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="bg-gray-50 p-4 rounded-lg"><p class="text-sm text-gray-500">Dialyzer</p><p class="text-xl font-bold text-gray-800">${protocol.dialyzer || 'N/A'}</p></div>
                    <div class="bg-gray-50 p-4 rounded-lg"><p class="text-sm text-gray-500">Access</p><p class="text-xl font-bold text-gray-800">${protocol.access || 'N/A'}</p></div>
                    <div class="bg-gray-50 p-4 rounded-lg"><p class="text-sm text-gray-500">Dialysate Flow</p><p class="text-lg font-medium text-gray-800">${protocol.dialysateFlow || 'N/A'}</p></div>
                    <div class="bg-gray-50 p-4 rounded-lg"><p class="text-sm text-gray-500">Blood Flow</p><p class="text-lg font-medium text-gray-800">${protocol.bloodFlow || 'N/A'}</p></div>
                    <div class="bg-gray-50 p-4 rounded-lg"><p class="text-sm text-gray-500">Duration</p><p class="text-lg font-medium text-gray-800">${protocol.duration || 'N/A'}</p></div>
                </div>`;
            break;
    }

    container.innerHTML = `
        <button id="back-to-list" class="flex items-center text-gray-600 hover:text-gray-800 transition mb-6 print-hidden">
            <svg class="h-5 w-5 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to Patient Roster
        </button>

        <div class="bg-white rounded-xl shadow-xl p-6 mb-6">
            <h2 class="text-3xl font-extrabold text-gray-800">${fullName}</h2>
            <p class="text-xl text-gray-600 mt-1">Age ${age} | HD Patient</p>
        </div>

        <div class="flex border-b border-gray-200 overflow-x-auto whitespace-nowrap mb-6 bg-white rounded-t-xl shadow-md p-2 print-hidden">
            ${tabs.map(tab => `
                <button data-tab="${tab.id}" class="tab-btn p-4 text-gray-600 hover:text-emerald-500 transition ${state.currentTab === tab.id ? 'tab-btn-active' : ''}">
                    ${tab.name}
                </button>
            `).join('')}
        </div>

        <div class="bg-white p-6 rounded-b-xl shadow-md">
            ${tabContentHtml}
        </div>
    `;
}

// --- EVENT LISTENER SETUP FUNCTION ---

/**
 * Sets up all necessary event listeners for the application.
 */
function setupEventListeners() {
    // 1. New Patient Button Handler
    const addPatientBtn = document.getElementById('add-patient-btn');
    if (addPatientBtn) {
        addPatientBtn.addEventListener('click', () => {
            console.log("New Patient button clicked! Opening modal.");
            // Reset form and open modal for new patient
            document.getElementById('patient-form')?.reset();
            document.getElementById('modal-title').textContent = 'Add New Patient';
            document.getElementById('patient-id').value = '';
            openModal('patient-modal');
        });
    }

    // 2. Patient Form Submission
    document.getElementById('patient-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const patientData = Object.fromEntries(formData.entries());
        
        if (patientData.name && patientData.familyname && patientData.birthdate) {
            addPatient(patientData);
        } else {
            showMessage("Please fill in all required patient fields.", 'error');
        }
    });

    // 3. Delegation for dynamic content (Patient list cards, tabs, print buttons, etc.)
    document.getElementById('content-container')?.addEventListener('click', async (e) => {
        // Patient Card Click (View Detail)
        const patientCard = e.target.closest('[data-patient-id]');
        if (patientCard) {
            const id = patientCard.getAttribute('data-patient-id');
            const patient = state.patientList.find(p => p.id === parseInt(id));
            if (patient) {
                state.currentPatient = patient;
                state.view = 'detail';
                state.currentTab = 'info';
                renderApp(); 
                await fetchPatientDetail(id);
            }
        }

        // Tab Click (Change View)
        const tabBtn = e.target.closest('.tab-btn');
        if (tabBtn) {
            state.currentTab = tabBtn.getAttribute('data-tab');
            renderApp();
        }

        // Back Button Click (Return to List)
        const backBtn = e.target.closest('#back-to-list');
        if (backBtn) {
            state.view = 'list';
            state.currentPatient = null;
            state.currentTab = 'info';
            fetchPatients(); 
        }

        // Add Record Button Click
        const addRecordBtn = e.target.closest('[data-add-record]');
        if (addRecordBtn) {
            showAddRecordPrompt(addRecordBtn.getAttribute('data-add-record'));
        }

        // Edit Protocol Button Click
        const editProtocolBtn = e.target.closest('#edit-protocol-btn');
        if (editProtocolBtn) {
            showProtocolEditPrompt();
        }

        // --- NEW: Print Button Click ---
        const printBtn = e.target.closest('[data-print-type]');
        if (printBtn) {
            const printType = printBtn.getAttribute('data-print-type');
            generatePrintableDocument(printType);
        }
    });
}

// --- INITIALIZATION ---
// VITAL FIX: Ensure all DOM elements are loaded before running initialization.
window.onload = function() {
    updateStatusIndicator(`Connecting to: ${API_BASE}`);
    setupEventListeners(); // Binds the buttons, including "New Patient"
    fetchPatients(); // Fetches data and calls renderApp()
};

