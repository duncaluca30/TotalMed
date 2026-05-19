import { useState, useEffect } from 'react'
import './App.css'
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import { AppBar, Toolbar, Typography, Button, TextField, Box, Tabs, Tab } from '@mui/material';

function App() {
  // 🔴 IMPORTANT: Keep your actual Render backend URL here!
  const API_URL = 'https://totalmed-backend.onrender.com'; 

  // UI & Security State
  const [isLoginView, setIsLoginView] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [loggedInToken, setLoggedInToken] = useState(localStorage.getItem('token') || null);
  const [userRole, setUserRole] = useState(localStorage.getItem('role') || null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // 👈 Forces the page to refresh when data changes
  const [accessCode, setAccessCode] = useState(null);
  
  // Dashboard Data State
  const [patientData, setPatientData] = useState(null);
  const [doctorData, setDoctorData] = useState(null);
  const [patientTab, setPatientTab] = useState(0);

  // Form States
  const [formData, setFormData] = useState({ email: '', password: '', firstName: '', lastName: '', dateOfBirth: '', phone: '' });
  const [visitForm, setVisitForm] = useState({ appointmentId: null, diagnosis: '', treatment: '', notes: '' });

  const [vaultCode, setVaultCode] = useState('');
  const [unlockedPatient, setUnlockedPatient] = useState(null);
  const [recordForm, setRecordForm] = useState({ diagnosis: '', treatment: '', notes: '' });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // --- FETCH SECURE DASHBOARD DATA ---
  useEffect(() => {
    if (!loggedInToken) return;

    if (userRole === 'PATIENT') {
      fetch(`${API_URL}/api/patient/dashboard`, { headers: { 'Authorization': `Bearer ${loggedInToken}` } })
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => {
        setPatientData(data);
        // 👈 Add this: If she already has a code active in the database, put it on screen immediately!
        if (data.accessCode && new Date() < new Date(data.accessCode.expiresAt)) {
          setAccessCode(data.accessCode.code);
        }
      })
      .catch(() => handleLogout());
    }

    if (userRole === 'DOCTOR') {
      fetch(`${API_URL}/api/doctor/dashboard`, { headers: { 'Authorization': `Bearer ${loggedInToken}` } })
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => setDoctorData(data))
      .catch(() => handleLogout());
    }
  }, [loggedInToken, userRole, refreshTrigger]); // 👈 Notice the refreshTrigger here!

  // --- SUBMIT REGISTRATION & LOGIN ---
  const handleRegister = async (e) => {
    e.preventDefault();
    setStatusMessage('Registering...');
    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData)
      });
      const data = await response.json();
      if (response.ok) {
        setStatusMessage('✅ Registration successful! You can now log in.');
        setIsLoginView(true);
      } else setStatusMessage(`❌ Error: ${data.error}`);
    } catch (error) { setStatusMessage('❌ Failed to connect.'); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setStatusMessage('Logging in...');
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: formData.email, password: formData.password })
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.role);
        setLoggedInToken(data.token);
        setUserRole(data.role);
        setStatusMessage('');
      } else setStatusMessage(`❌ Error: ${data.error}`);
    } catch (error) { setStatusMessage('❌ Failed to connect.'); }
  };

  const handleGenerateCode = async () => {
    try {
      const response = await fetch(`${API_URL}/api/patient/generate-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${loggedInToken}`
        }
      });
      
      const data = await response.json();
      if (response.ok) {
        setAccessCode(data.code);
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      alert("Failed to connect to server.");
    }
  };

  const handleUnlockVault = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/doctor/access-vault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${loggedInToken}` },
        body: JSON.stringify({ code: vaultCode })
      });
      const data = await response.json();
      if (response.ok) {
        setUnlockedPatient(data.patient);
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (error) { alert("Failed to connect."); }
  };

  const handleInjectRecord = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/doctor/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${loggedInToken}` },
        body: JSON.stringify({
          patientId: unlockedPatient.id,
          code: vaultCode,
          ...recordForm
        })
      });
      if (response.ok) {
        alert("✅ Record Injected & Code Burned!");
        setUnlockedPatient(null);
        setVaultCode('');
        setRecordForm({ diagnosis: '', treatment: '', notes: '' });
      } else {
        const data = await response.json();
        alert(`❌ ${data.error}`);
      }
    } catch (error) { alert("Failed to save."); }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setLoggedInToken(null);
    setUserRole(null);
    setPatientData(null);
    setDoctorData(null);
    setStatusMessage('Logged out safely.');
  };

  // --- 🩺 DOCTOR: SUBMIT MEDICAL RECORD ---
  const handleCompleteVisit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/doctor/appointments/${visitForm.appointmentId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${loggedInToken}`
        },
        body: JSON.stringify({
          diagnosis: visitForm.diagnosis,
          treatment: visitForm.treatment,
          notes: visitForm.notes
        })
      });

      if (response.ok) {
        alert("✅ Medical Record Saved & Appointment Completed!");
        setVisitForm({ appointmentId: null, diagnosis: '', treatment: '', notes: '' }); // Reset form
        setRefreshTrigger(prev => prev + 1); // Trigger the useEffect to refresh the schedule!
      } else {
        const data = await response.json();
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      alert('❌ Failed to save record.');
    }
  };

  // ==========================================
  // 🩺 DOCTOR DASHBOARD VIEW
  // ==========================================
  if (loggedInToken && userRole === 'DOCTOR') {
    return (
      <div className="container">
        <AppBar position="static" sx={{ borderRadius: '8px', mb: 4, backgroundColor: '#0984e3', boxShadow: 3 }}>
          <Toolbar>
            <MedicalServicesIcon sx={{ mr: 2 }} />
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold', letterSpacing: '1px' }}>
              TotalMed Doctor Portal
            </Typography>
            <Button color="inherit" onClick={handleLogout} sx={{ fontWeight: 'bold' }}>
              Secure Logout
            </Button>
          </Toolbar>
        </AppBar>
        
        {!doctorData ? <p>Loading system...</p> : (
          <>
            <div className="card" style={{ backgroundColor: '#e8f4f8', color: '#2d3436' }}>
              <h3>Physician Profile</h3>
              <p><strong>Dr. {doctorData.firstName} {doctorData.lastName}</strong> | {doctorData.specialty}</p>
            </div>

            {/* --- THE VAULT SEARCH BAR --- */}
            {!unlockedPatient ? (
              <div className="card" style={{ marginTop: '30px', backgroundColor: '#f1f2f6', textAlign: 'center' }}>
                <h3>🔑 Unlock Patient File</h3>
                <p>Enter the 6-digit access code provided by the patient.</p>
                <form onSubmit={handleUnlockVault} style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '15px' }}>
                  <input 
                    type="text" 
                    placeholder="e.g. 123456" 
                    maxLength="6"
                    value={vaultCode}
                    onChange={(e) => setVaultCode(e.target.value)}
                    style={{ fontSize: '1.5em', letterSpacing: '3px', width: '200px', textAlign: 'center' }}
                    required 
                  />
                  <button type="submit" style={{ backgroundColor: '#0984e3' }}>Access Vault</button>
                </form>
              </div>
            ) : (
              /* --- THE UNLOCKED PATIENT FILE --- */
              <div className="card" style={{ marginTop: '30px', border: '2px solid #00b894' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #dfe6e9', paddingBottom: '10px', marginBottom: '15px' }}>
                  <h3 style={{ color: '#00b894', margin: 0 }}>🔓 Vault Unlocked</h3>
                  <button onClick={() => setUnlockedPatient(null)} style={{ backgroundColor: '#636e72', padding: '5px 10px', fontSize: '0.8em' }}>Close File</button>
                </div>
                
                <h4>Patient: {unlockedPatient.firstName} {unlockedPatient.lastName}</h4>
                <p><strong>DOB:</strong> {new Date(unlockedPatient.dateOfBirth).toLocaleDateString()}</p>

                <h4 style={{ marginTop: '20px' }}>Inject New Medical Record</h4>
                <form onSubmit={handleInjectRecord} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input type="text" placeholder="Diagnosis (Required)" required value={recordForm.diagnosis} onChange={(e) => setRecordForm({...recordForm, diagnosis: e.target.value})} />
                  <input type="text" placeholder="Treatment Plan" value={recordForm.treatment} onChange={(e) => setRecordForm({...recordForm, treatment: e.target.value})} />
                  <textarea placeholder="Clinical Notes" rows="3" value={recordForm.notes} onChange={(e) => setRecordForm({...recordForm, notes: e.target.value})} />
                  <button type="submit" style={{ backgroundColor: '#00b894', color: 'white', marginTop: '10px' }}>Save Record & Lock Vault</button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (loggedInToken && userRole === 'PATIENT') {
    return (
      <div className="container">
        <AppBar position="static" sx={{ borderRadius: '8px', mb: 4, backgroundColor: '#0984e3', boxShadow: 3 }}>
          <Toolbar>
            <MedicalServicesIcon sx={{ mr: 2 }} />
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold', letterSpacing: '1px' }}>
              TotalMed Patient Portal
            </Typography>
            <Button color="inherit" onClick={handleLogout} sx={{ fontWeight: 'bold' }}>
              Secure Logout
            </Button>
          </Toolbar>
        </AppBar>
        
        {!patientData ? <p>Loading your secure medical records...</p> : (
          <Box sx={{ width: '100%' }}>
            
            {/* --- THE TAB NAVIGATION --- */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
              <Tabs value={patientTab} onChange={(e, newValue) => setPatientTab(newValue)} textColor="primary" indicatorColor="primary">
                <Tab label="Dashboard & Vault Key" sx={{ fontWeight: 'bold' }} />
                <Tab label="Medical History" sx={{ fontWeight: 'bold' }} />
              </Tabs>
            </Box>

            {/* --- TAB 0: DASHBOARD & VAULT KEY --- */}
            {patientTab === 0 && (
              <Box>
                {/* 1. THE PATIENT PROFILE CARD */}
                <div className="card" style={{ backgroundColor: '#f8f9fa', color: '#2d3436' }}>
                  <h3>Patient Profile</h3>
                  <p><strong>Name:</strong> {patientData.firstName} {patientData.lastName}</p>
                  <p><strong>DOB:</strong> {new Date(patientData.dateOfBirth).toLocaleDateString()}</p>
                </div>

                {/* 2. THE SECURE SHARE VAULT */}
                <div className="card" style={{ backgroundColor: '#fff3cd', color: '#856404', marginTop: '20px', border: '2px dashed #ffeeba' }}>
                  <h3>🔐 Share Medical File</h3>
                  <p>Generate a temporary 6-digit code to allow a doctor to view your history and add new records. This code expires in 60 minutes.</p>
                  
                  {!accessCode ? (
                    <button onClick={handleGenerateCode} style={{ backgroundColor: '#f39c12', color: 'white', fontWeight: 'bold' }}>
                      Generate Access Code
                    </button>
                  ) : (
                    <div style={{ textAlign: 'center', margin: '15px 0' }}>
                      <p style={{ fontSize: '1.2em', marginBottom: '5px' }}>Your Secure Code:</p>
                      <h1 style={{ letterSpacing: '5px', color: '#d35400', fontSize: '3em', margin: '0' }}>{accessCode}</h1>
                      <p style={{ fontSize: '0.8em', color: '#e74c3c' }}>Show this to your doctor. Do not close this window.</p>
                    </div>
                  )}
                </div>
              </Box>
            )}

            {/* --- TAB 1: MEDICAL HISTORY --- */}
            {patientTab === 1 && (
              <Box>
                <h3 style={{ borderBottom: '2px solid #dfe6e9', paddingBottom: '10px', color: '#2d3436' }}>📁 Your Medical History</h3>
                
                {patientData.medicalRecords && patientData.medicalRecords.length > 0 ? (
                  patientData.medicalRecords.map((record) => (
                    <div key={record.id} className="card" style={{ borderLeft: '5px solid #0984e3', marginBottom: '15px', backgroundColor: '#ffffff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <h4 style={{ margin: 0, color: '#2d3436' }}>{record.diagnosis}</h4>
                        <span style={{ fontSize: '0.9em', color: '#636e72' }}>
                          {new Date(record.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p style={{ margin: '5px 0', fontSize: '0.95em' }}><strong>Attending Physician:</strong> Dr. {record.doctor.lastName}</p>
                      {record.treatment && <p style={{ margin: '5px 0', fontSize: '0.95em' }}><strong>Treatment Plan:</strong> {record.treatment}</p>}
                      {record.notes && (
                        <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f1f2f6', borderRadius: '4px', fontSize: '0.9em', fontStyle: 'italic' }}>
                          "{record.notes}"
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p style={{ color: '#636e72', fontStyle: 'italic' }}>Your medical vault is currently empty.</p>
                )}
              </Box>
            )}
            
          </Box>
        )}
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={{ color: '#0984e3', fontSize: '2.5em', margin: 0 }}>TotalMed</h1>
        <p style={{ color: '#636e72', marginTop: '5px' }}>Secure Ephemeral Health Vault</p>
      </div>

      <div className="card" style={{ maxWidth: '400px', margin: '0 auto', padding: '30px' }}>
        <Typography variant="h4" sx={{ mb: 3, textAlign: 'center', fontWeight: 'bold', color: '#2d3436' }}>
          {isLoginView ? 'Sign In' : 'Patient Registration'}
        </Typography>

        <Box component="form" onSubmit={isLoginView ? handleLogin : handleRegister} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          
          {!isLoginView && (
            <>
              <TextField label="First Name" name="firstName" onChange={handleChange} required fullWidth />
              <TextField label="Last Name" name="lastName" onChange={handleChange} required fullWidth />
              <TextField label="Date of Birth" name="dateOfBirth" type="date" onChange={handleChange} required fullWidth InputLabelProps={{ shrink: true }} />
              <TextField label="Phone Number" name="phone" type="tel" onChange={handleChange} required fullWidth />
            </>
          )}
          
          <TextField label="Email Address" name="email" type="email" onChange={handleChange} required fullWidth />
          <TextField label="Password" name="password" type="password" onChange={handleChange} required fullWidth />

          {statusMessage && (
            <Typography sx={{ color: '#ff4757', textAlign: 'center', fontWeight: 'bold', mt: 1 }}>
              {statusMessage}
            </Typography>
          )}

          <Button 
            type="submit" 
            variant="contained" 
            size="large" 
            sx={{ mt: 1, backgroundColor: '#0984e3', py: 1.5, fontSize: '1.1rem', textTransform: 'none', borderRadius: '8px' }}
          >
            {isLoginView ? 'Secure Login' : 'Register Patient'}
          </Button>

        </Box>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <Button variant="text" onClick={() => setIsLoginView(!isLoginView)} sx={{ textTransform: 'none', color: '#636e72' }}>
            {isLoginView ? "New patient? Sign up here" : "Already have an account? Sign in"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default App