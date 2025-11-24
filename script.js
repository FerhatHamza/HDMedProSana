// --- Configuration and State ---
    let state = {
        view: 'list',
        currentPatient: null,
        currentTab: 'info',
        patientList: [],
        isLoading: false,
    };
    
    // IMPORTANT: Keep your worker URL here
    const API_BASE = 'https://hdmedprosana-api.ferhathamza17.workers.dev/api';
    const statusIndicator = document.getElementById('api-status-indicator');

    // --- UTILITY FUNCTIONS ---

    function updateStatusIndicator(message, type = 'info') {
        statusIndicator.textContent = message;
        statusIndicator.className = 'p-2 mb-4 text-sm rounded-lg';
        statusIndicator.classList.remove('hidden');

        switch (type) {
            case 'success':
                statusIndicator.classList.add('text-green-700', 'bg-green-100');
                break;
            case 'error':
                statusIndicator.classList.add('text-red-700', 'bg-red-100', 'font-bold');
                break;
            case 'info':
            default:
                statusIndicator.classList.add('text-blue-700', 'bg-blue-100');
                break;
        }
    }

    function showMessage(text, type = 'success') {
        const box = document.getElementById('message-box');
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

    function openModal(modalId) {
        document.getElementById(modalId).classList.add('modal-active');
    }

    function closeModal(modalId) {
        document.getElementById(modalId).classList.remove('modal-active');
    }

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
            console.log(`[API] Fetching: ${method} ${fullUrl}`);

            const response = await fetch(fullUrl, options);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[API ERROR] Status: ${response.status}`, errorText);
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

    async function fetchPatients() {
        const result = await apiFetch('/patients');
        if (result && result.patients) {
            state.patientList = result.patients.sort((a, b) => (a.familyname || '').localeCompare(b.familyname || ''));
             if (state.view === 'detail' && state.currentPatient) {
                const updatedPatient = state.patientList.find(p => p.id === state.currentPatient.id);
                if (updatedPatient) {
                    await fetchPatientDetail(updatedPatient.id);
                }
            }
            renderApp();
        } else if (result) {
            state.patientList = [];
            renderApp();
        }
    }

    async function fetchPatientDetail(patientId) {
        const [patientRes, medsRes, labsRes, protocolRes, sessionsRes] = await Promise.all([
            apiFetch(`/patients/${patientId}`),
            apiFetch(`/patients/${patientId}/medications`),
            apiFetch(`/patients/${patientId}/labs`),
            apiFetch(`/patients/${patientId}/protocol`),
            apiFetch(`/patients/${patientId}/sessions`), // Fetch sessions
        ]);

        if (patientRes) {
            state.currentPatient = {
                ...patientRes.patient,
                medications: (medsRes?.medications || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
                labResults: (labsRes?.labResults || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
                protocol: protocolRes?.protocol || {},
                sessions: (sessionsRes?.sessions || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
            };
            renderApp();
        } else {
            showMessage("Patient failed to load.", 'error');
            state.view = 'list';
            state.currentPatient = null;
            fetchPatients();
        }
    }

    async function addPatient(patientData) {
        const result = await apiFetch('/patients', 'POST', patientData);
        if (result && result.patient) {
            showMessage(`${patientData.name} ${patientData.familyname} added successfully.`);
            closeModal('patient-modal');
            await fetchPatients();
        }
    }

    async function addPatientRecord(patientId, type, record) {
        // type is 'medications', 'labs', or 'sessions'
        const url = `/patients/${patientId}/${type}`; 
        const result = await apiFetch(url, 'POST', record);
        if (result && result.success) {
            showMessage(`New entry added to ${type}.`);
            await fetchPatientDetail(patientId);
        }
    }

    async function updatePatientProtocol(patientId, protocolData) {
        const result = await apiFetch(`/patients/${patientId}/protocol`, 'PUT', protocolData);
        if (result && result.success) {
            showMessage("Hemodialysis Protocol updated.");
            await fetchPatientDetail(patientId);
        }
    }

    // --- PROMPT/INPUT FUNCTIONS ---

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
            // New Session - More complex, maybe use a custom UI or series of prompts
            // For simplicity in this prompt-based version:
            const preW = prompt("Poids AVANT (kg):");
            if (!preW) return;
            const postW = prompt("Poids APRÈS (kg):");
            const preBP = prompt("Tension AVANT (ex: 130/80):");
            const postBP = prompt("Tension APRÈS:");
            const access = prompt("État de l'abord (Fistule/KT):", "Bon état");
            const note = prompt("Observations / Incidents:");

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
    
    // --- EVENT LISTENERS ---

    document.addEventListener('DOMContentLoaded', () => {
        updateStatusIndicator(`Connecting to: ${API_BASE}`);
        fetchPatients();

        document.getElementById('add-patient-btn').addEventListener('click', () => {
            document.getElementById('patient-form').reset();
            document.getElementById('modal-title').textContent = 'Add New Patient';
            document.getElementById('patient-id').value = '';
            openModal('patient-modal');
        });

        document.getElementById('patient-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const patientData = Object.fromEntries(formData.entries());
            if (patientData.name && patientData.familyname && patientData.birthdate) {
                addPatient(patientData);
            } else {
                showMessage("Please fill in all required patient fields.", 'error');
            }
        });

        document.getElementById('content-container').addEventListener('click', async (e) => {
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

            const tabBtn = e.target.closest('.tab-btn');
            if (tabBtn) {
                state.currentTab = tabBtn.getAttribute('data-tab');
                renderApp();
            }

            const backBtn = e.target.closest('#back-to-list');
            if (backBtn) {
                state.view = 'list';
                state.currentPatient = null;
                state.currentTab = 'info';
                fetchPatients(); 
            }

            const addRecordBtn = e.target.closest('[data-add-record]');
            if (addRecordBtn) {
                showAddRecordPrompt(addRecordBtn.getAttribute('data-add-record'));
            }

            const editProtocolBtn = e.target.closest('#edit-protocol-btn');
            if (editProtocolBtn) {
                showProtocolEditPrompt();
            }
        });
    });

    // --- RENDERING FUNCTIONS ---
    
    function renderApp() {
        const container = document.getElementById('content-container');

        if (state.isLoading && !state.currentPatient) { // Only show full loader if not refreshing details
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

    function renderPatientDetail(container) {
        const p = state.currentPatient;
        const fullName = `${p.name} ${p.familyname}`;
        const age = calculateAge(p.birthdate);
        
        // ADDED: 'Sessions' tab
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
        const sessions = p.sessions || []; // New array for sessions
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
                        <span class="font-bold text-gray-800">Date: ${s.date}</span>
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
                    <div class="flex justify-end mb-4">
                        <button data-add-record="sessions" class="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition font-medium text-sm shadow-md">+ New Session</button>
                    </div>
                    <div class="space-y-3">
                        ${renderSessions(sessions)}
                    </div>`;
                break;
            case 'meds':
                tabContentHtml = `
                    <div class="flex justify-end mb-4">
                        <button data-add-record="meds" class="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition font-medium text-sm shadow-md">+ Add Medication</button>
                    </div>
                    <div class="space-y-3">${renderRecords(meds, 'medications')}</div>`;
                break;
            case 'labs':
                tabContentHtml = `
                    <div class="flex justify-end mb-4">
                        <button data-add-record="labs" class="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition font-medium text-sm shadow-md">+ Add Lab Result</button>
                    </div>
                    <div class="space-y-3">${renderRecords(labs, 'labs')}</div>`;
                break;
            case 'protocol':
                tabContentHtml = `
                    <div class="flex justify-end mb-4">
                        <button id="edit-protocol-btn" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium text-sm shadow-md">Edit Protocol</button>
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
            <button id="back-to-list" class="flex items-center text-gray-600 hover:text-gray-800 transition mb-6">
                <svg class="h-5 w-5 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                Back to Patient Roster
            </button>

            <div class="bg-white rounded-xl shadow-xl p-6 mb-6">
                <h2 class="text-3xl font-extrabold text-gray-800">${fullName}</h2>
                <p class="text-xl text-gray-600 mt-1">Age ${age} | HD Patient</p>
            </div>

            <div class="flex border-b border-gray-200 overflow-x-auto whitespace-nowrap mb-6 bg-white rounded-t-xl shadow-md p-2">
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
