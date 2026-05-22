import { useState, useEffect } from 'react'
import './App.css'
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import { io } from 'socket.io-client';
import { AppBar, Toolbar, Typography, Button, TextField, Box, Tabs, Tab, Dialog,
   DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText, Checkbox } from '@mui/material';
   
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';

function App() {
  const API_URL = 'https://totalmed-backend.onrender.com'; 

  const [isLoginView, setIsLoginView] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [loggedInToken, setLoggedInToken] = useState(localStorage.getItem('token') || null);
  const [userRole, setUserRole] = useState(localStorage.getItem('role') || null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [accessCode, setAccessCode] = useState(null);

  const [patientData, setPatientData] = useState(null);
  const [doctorData, setDoctorData] = useState(null);
  const [patientTab, setPatientTab] = useState(0);

  const [formData, setFormData] = useState({ email: '', password: '', confirmPassword: '', firstName: '', lastName: '', dateOfBirth: '', phone: '' });
  const [visitForm, setVisitForm] = useState({ appointmentId: null, diagnosis: '', treatment: '', notes: '' });

  const [vaultCode, setVaultCode] = useState('');
  const [unlockedPatient, setUnlockedPatient] = useState(null);
  const [recordForm, setRecordForm] = useState({ diagnosis: '', treatment: '', notes: '' });

  const [socket, setSocket] = useState(null);
  const [authRequest, setAuthRequest] = useState(null);

  const [popupSearch, setPopupSearch] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState([]);

  const [dateInputType, setDateInputType] = useState('text');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  useEffect(() => {
    if (!loggedInToken) return;

    if (userRole === 'PATIENT') {
      fetch(`${API_URL}/api/patient/dashboard`, { headers: { 'Authorization': `Bearer ${loggedInToken}` } })
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => {
        setPatientData(data);
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
  }, [loggedInToken, userRole, refreshTrigger]);

  useEffect(() => {
    if (loggedInToken && userRole === 'PATIENT' && patientData) {

      const newSocket = io(API_URL);
      setSocket(newSocket);

      newSocket.emit('join-secure-room', patientData.id);

      newSocket.on('auth-request', (data) => {
        setAuthRequest(data);
      });

      newSocket.on('vault-updated', (data) => {

        console.log("🚨 WEBSOCKET RECEIVED:", data);
        
        setAccessCode(null);

        setPatientData(prevData => ({
          ...prevData,
          medicalRecords: [data.newRecord, ...prevData.medicalRecords]
        }));

        setPatientTab(1); 
      });

      return () => newSocket.disconnect();
    }
  }, [loggedInToken, userRole, patientData]);

  const handleRegister = async (e) => {
    e.preventDefault();

    const selectedDate = new Date(formData.dateOfBirth);
    const today = new Date();
    if (selectedDate > today) {
      setStatusMessage("❌ Error: Date of birth cannot be in the future.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setStatusMessage("❌ Error: Passwords do not match!"); 
      return; 
    }

    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!passwordRegex.test(formData.password)) {
      setStatusMessage("❌ Error: Password must be 8+ characters, with 1 letter, 1 number, and 1 special character.");
      return;
    }

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
    } catch (error) { setStatusMessage('❌ Failed to connect to server.'); }
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

  const handleAuthDecision = (approved) => {
    socket.emit('auth-response', { 
      code: authRequest.code, 
      approved: approved,
      sharedRecordIds: selectedRecordIds 
    });
    
    setAuthRequest(null);
    setPopupSearch('');
    setSelectedRecordIds([]);
  };

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
        setVisitForm({ appointmentId: null, diagnosis: '', treatment: '', notes: '' });
        setRefreshTrigger(prev => prev + 1);
      } else {
        const data = await response.json();
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      alert('❌ Failed to save record.');
    }
  };


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
              <div className="card" style={{ marginTop: '30px', backgroundColor: '#ffffff', textAlign: 'center', padding: '30px' }}>
                <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1, color: '#2d3436' }}>🔑 Unlock Patient File</Typography>
                <Typography sx={{ color: '#636e72', mb: 3 }}>Enter the 6-digit access code provided by the patient.</Typography>
                
                <Box component="form" onSubmit={handleUnlockVault} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <TextField 
                    label="6-Digit Vault Code" 
                    variant="outlined"
                    value={vaultCode}
                    onChange={(e) => setVaultCode(e.target.value)}
                    inputProps={{ maxLength: 6, style: { fontSize: '1.5em', letterSpacing: '8px', textAlign: 'center', color: '#2d3436' } }}
                    required 
                  />
                  <Button type="submit" variant="contained" size="large" sx={{ backgroundColor: '#0984e3', px: 4 }}>
                    Access Vault
                  </Button>
                </Box>
              </div>
            ) : (

              <div className="card" style={{ marginTop: '30px', border: '2px solid #00b894' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #dfe6e9', paddingBottom: '10px', marginBottom: '15px' }}>
                  <h3 style={{ color: '#00b894', margin: 0 }}>Vault Unlocked</h3>
                  <button onClick={() => setUnlockedPatient(null)} style={{ backgroundColor: '#636e72', padding: '5px 10px', fontSize: '0.8em' }}>Close File</button>
                </div>
                
                <h4>Patient: {unlockedPatient.firstName} {unlockedPatient.lastName}</h4>
                <p><strong>DOB:</strong> {new Date(unlockedPatient.dateOfBirth).toLocaleDateString()}</p>

                {unlockedPatient?.medicalRecords && (
                  <Box sx={{ mb: 4, mt: 3, p: 3, border: '1px solid #dfe6e9', borderRadius: '8px', backgroundColor: '#f8f9fa' }}>
                    <Typography variant="h6" sx={{ color: '#0984e3', mb: 2, fontWeight: 'bold' }}>
                      📁 Shared Medical History ({unlockedPatient.medicalRecords.length} records)
                    </Typography>
                    
                    {unlockedPatient.medicalRecords.length > 0 ? (
                      <List>
                        {unlockedPatient.medicalRecords.map((record) => (
                          <ListItem key={record.id} sx={{ borderBottom: '1px solid #dfe6e9', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', pb: 2, mb: 2 }}>
                             <Typography variant="subtitle1" sx={{ color: '#2d3436' }}>
                               <strong>Diagnosis:</strong> {record.diagnosis}
                             </Typography>
                             <Typography variant="body2" sx={{ mt: 0.5 }}>
                               <strong>Treatment:</strong> {record.treatment}
                             </Typography>
                             <Typography variant="body2" sx={{ mt: 0.5, color: '#636e72' }}>
                               <strong>Notes:</strong> {record.notes}
                             </Typography>
                             <Typography variant="caption" sx={{ mt: 1, color: '#b2bec3' }}>
                               Date: {new Date(record.createdAt).toLocaleDateString()} | Attending: Dr. {record.doctor?.lastName || 'Unknown'}
                             </Typography>
                          </ListItem>
                        ))}
                      </List>
                    ) : (
                      <Typography sx={{ color: '#e17055', fontStyle: 'italic' }}>
                        The patient chose not to share any prior medical records.
                      </Typography>
                    )}
                  </Box>
                )}

                <h4 style={{ marginTop: '20px', color: '#2d3436' }}>Inject New Medical Record</h4>
                <Box component="form" onSubmit={handleInjectRecord} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                  <TextField label="Diagnosis (Required)" required value={recordForm.diagnosis} onChange={(e) => setRecordForm({...recordForm, diagnosis: e.target.value})} fullWidth />
                  <TextField label="Treatment Plan" value={recordForm.treatment} onChange={(e) => setRecordForm({...recordForm, treatment: e.target.value})} fullWidth />
                  <TextField label="Clinical Notes" multiline rows={3} value={recordForm.notes} onChange={(e) => setRecordForm({...recordForm, notes: e.target.value})} fullWidth />
                  <Button type="submit" variant="contained" sx={{ backgroundColor: '#00b894', color: 'white', mt: 1, py: 1.5, fontSize: '1.1rem' }}>
                    Save Record & Lock Vault
                  </Button>
                </Box>
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
      <Dialog open={!!authRequest} disableEscapeKeyDown maxWidth="sm" fullWidth>
        <DialogTitle sx={{ backgroundColor: '#0984e3', color: 'white', fontWeight: 'bold' }}>
          🚨 Access Request: {authRequest?.doctorName}
        </DialogTitle>
        
        <DialogContent sx={{ mt: 2 }}>
          <Typography sx={{ mb: 2, color: '#2d3436' }}>
            Please select the specific medical records you wish to share with this physician.
          </Typography>

          {/* 1. The Search Bar */}
          <TextField 
            fullWidth 
            size="small" 
            label="Filter Diagnostics..." 
            variant="outlined" 
            value={popupSearch}
            onChange={(e) => setPopupSearch(e.target.value)}
            sx={{ mb: 2 }}
          />

          {/* 2. The Interactive Checklist */}
          <Box sx={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #dfe6e9', borderRadius: '4px' }}>
            <List>
              {(patientData?.medicalRecords || [])
              .filter(record => record.diagnosis.toLowerCase().includes(popupSearch.toLowerCase()))
              .map((record) => {
                  const isChecked = selectedRecordIds.includes(record.id);
                  return (
                    <ListItem 
                      key={record.id} 
                      button 
                      onClick={() => {
                        if (isChecked) {
                          setSelectedRecordIds(selectedRecordIds.filter(id => id !== record.id));
                        } else {
                          setSelectedRecordIds([...selectedRecordIds, record.id]);
                        }
                      }}
                    >
                      <Checkbox checked={isChecked} color="primary" />
                      <ListItemText 
                        primary={<strong>{record.diagnosis}</strong>} 
                        secondary={`${new Date(record.createdAt).toLocaleDateString()} - Dr. ${record.doctor.lastName}`} 
                      />
                    </ListItem>
                  );
              })}
              {patientData?.medicalRecords?.length === 0 && (
                <Typography sx={{ p: 2, color: '#636e72', fontStyle: 'italic', textAlign: 'center' }}>
                  No medical records available to share.
                </Typography>
              )}
            </List>
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 3, justifyContent: 'space-between', borderTop: '1px solid #dfe6e9' }}>
          <Button onClick={() => handleAuthDecision(false)} variant="outlined" color="error">
            Deny All Access
          </Button>
          <Button 
            onClick={() => handleAuthDecision(true)} 
            variant="contained" 
            color="success"
            disabled={selectedRecordIds.length === 0}
          >
            Share {selectedRecordIds.length} Selected Record(s)
          </Button>
        </DialogActions>
      </Dialog>
      </div>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
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
              
              <DatePicker 
                label="Date of Birth *"
                disableFuture
                value={formData.dateOfBirth ? dayjs(formData.dateOfBirth) : null}
                onChange={(newValue) => {
                  setFormData({ 
                    ...formData, 
                    dateOfBirth: newValue ? newValue.format('YYYY-MM-DD') : '' 
                  });
                }}
                slotProps={{ 
                  textField: { 
                    fullWidth: true, 
                    required: true 
                  } 
                }}
              />
              
              <TextField label="Phone Number" name="phone" type="tel" onChange={handleChange} required fullWidth />
            </>
          )}
          
          <TextField label="Email Address" name="email" type="email" onChange={handleChange} required fullWidth />
          <TextField label="Password" name="password" type="password" onChange={handleChange} required fullWidth />
          
          {!isLoginView && (
            <TextField 
              label="Confirm Password" 
              type="password" 
              value={formData.confirmPassword}
              onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
              required
              fullWidth
            />
          )}

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
    </LocalizationProvider>
  )
}

export default App