--
-- Cloudflare D1 Schema for MedProSana
--

-- Table for main patient data
CREATE TABLE IF NOT EXISTS Patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    familyname TEXT NOT NULL,
    birthdate TEXT NOT NULL, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table for patient hemodialysis protocols (1-to-1 relationship with Patients)
-- We store the protocol as JSON for easy updates to complex, non-searchable fields.
CREATE TABLE IF NOT EXISTS Protocols (
    patient_id INTEGER PRIMARY KEY,
    dialyzer TEXT,
    access TEXT,
    dialysateFlow TEXT,
    bloodFlow TEXT,
    duration TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patient_id) REFERENCES Patients(id) ON DELETE CASCADE
);

-- Table for patient medication history
CREATE TABLE IF NOT EXISTS Medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    date TEXT DEFAULT (strftime('%Y-%m-%d', 'now')), 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patient_id) REFERENCES Patients(id) ON DELETE CASCADE
);

-- Table for patient lab results history
CREATE TABLE IF NOT EXISTS LabResults (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    result TEXT NOT NULL, 
    date TEXT DEFAULT (strftime('%Y-%m-%d', 'now')), 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patient_id) REFERENCES Patients(id) ON DELETE CASCADE
);

