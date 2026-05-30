import { useState, useEffect } from 'react'
import './App.css'
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import { io } from 'socket.io-client';
import { AppBar, Toolbar, Typography, Button, TextField, Box, Tabs, Tab, Dialog,
   DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText, Checkbox, Snackbar, Alert} from '@mui/material';
   
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { startRegistration } from '@simplewebauthn/browser';

function App() {
  const API_URL = 'https://totalmed-backend.onrender.com'; 

  const [isLoginView, setIsLoginView] = useState(true);
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

  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });

  const [requires2FA, setRequires2FA] = useState(false);
  const [savedUserId, setSavedUserId] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');

  const [available2FAMethods, setAvailable2FAMethods] = useState(['EMAIL']);
  const [selected2FAMethod, setSelected2FAMethod] = useState('EMAIL');
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [twoFactorSecret, setTwoFactorSecret] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [setupStep, setSetupStep] = useState('initial'); // 'initial' | 'scan' | 'success'

  const handleCloseToast = (event, reason) => {
    if (reason === 'clickaway') return;
    setToast({ ...toast, open: false });
  };

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
      newSocket.on('auth-request', (data) => setAuthRequest(data));
      newSocket.on('vault-updated', (data) => {
        setAccessCode(null);
        setPatientData(prevData => ({ ...prevData, medicalRecords: [data.newRecord, ...prevData.medicalRecords] }));
        setPatientTab(1); 
      });
      return () => newSocket.disconnect();
    }
  }, [loggedInToken, userRole, patientData]);

  const handleRegister = async (e) => {
    e.preventDefault();

    const selectedDate = new Date(formData.dateOfBirth);
    if (selectedDate > new Date()) {
      return setToast({ open: true, message: "Date of birth cannot be in the future.", severity: 'error' });
    }
    if (formData.password !== formData.confirmPassword) {
      return setToast({ open: true, message: "Passwords do not match!", severity: 'error' });
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(formData.password)) {
      return setToast({ open: true, message: "Password must be 8+ characters, with 1 uppercase, 1 lowercase, 1 number, and 1 special character.", severity: 'error' });
    }

    setToast({ open: true, message: 'Registering...', severity: 'info' });
    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData)
      });
      const data = await response.json();
      if (response.ok) {
        setToast({ open: true, message: '✅ Registration successful! You can now log in.', severity: 'success' });
        setIsLoginView(true);
      } else setToast({ open: true, message: data.error, severity: 'error' });
    } catch (error) { setToast({ open: true, message: 'Failed to connect to server.', severity: 'error' }); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setToast({ open: true, message: 'Verifying credentials...', severity: 'info' });
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: formData.email, password: formData.password })
      });
      const data = await response.json();
      
      if (!response.ok) return setToast({ open: true, message: data.error, severity: 'error' });

      if (data.requires2FA) {
        setSavedUserId(data.userId);
        setRequires2FA(true);
        setAvailable2FAMethods(data.methods);
        
        const defaultMethod = data.methods.includes('APP') ? 'APP' : 'EMAIL';
        setSelected2FAMethod(defaultMethod);
        
        if (defaultMethod === 'EMAIL') {
          handleSendEmailCode(data.userId);
        } else {
          setToast({ open: true, message: "Please open Google Authenticator.", severity: 'info' });
        }
      }
    } catch (error) { setToast({ open: true, message: 'Failed to connect.', severity: 'error' }); }
  };

const handleSendEmailCode = async (uid = savedUserId) => {
    setToast({ open: true, message: 'Dispatching secure code to your email...', severity: 'info' });
    try {
      const response = await fetch(`${API_URL}/api/auth/2fa/send-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: uid })
      });
      if (response.ok) {
        setEmailCodeSent(true);
        setToast({ open: true, message: 'Code successfully sent to your email!', severity: 'success' });
      }
    } catch (error) { setToast({ open: true, message: 'Failed to send email.', severity: 'error' }); }
  };

  const handle2FAValidation = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/auth/2fa/validate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ userId: savedUserId, token: twoFactorToken, method: selected2FAMethod }) // 👈 Pass the selected method
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.role);
        setLoggedInToken(data.token);
        setUserRole(data.role);
        setToast({ open: true, message: 'Identity Verified! Welcome.', severity: 'success' });
        
        setRequires2FA(false);
        setTwoFactorToken('');
        setEmailCodeSent(false);
      } else {
        setToast({ open: true, message: data.error, severity: 'error' });
      }
    } catch (error) { setToast({ open: true, message: 'Failed to validate 2FA.', severity: 'error' }); }
  };

  // 2FA SETUP LOGIC
  const handleStart2FASetup = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/2fa/generate`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${loggedInToken}`, 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        setQrCodeUrl(data.qrCodeUrl);
        setTwoFactorSecret(data.secret);
        setSetupStep('scan');
      } else {
        setToast({ open: true, message: data.error, severity: 'error' });
      }
    } catch (err) { setToast({ open: true, message: 'Failed to generate 2FA', severity: 'error' }); }
  };

  const handleVerify2FASetup = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/auth/2fa/verify-setup`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${loggedInToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: setupPin })
      });
      const data = await res.json();
      if (res.ok) {
        setSetupStep('success');
        setToast({ open: true, message: '2FA activated successfully!', severity: 'success' });
      } else {
        setToast({ open: true, message: data.error, severity: 'error' });
      }
    } catch (err) { setToast({ open: true, message: 'Failed to verify 2FA', severity: 'error' }); }
  };

  const handleEnableBiometrics = async () => {
    setToast({ open: true, message: 'Initiating biometric setup...', severity: 'info' });
    try {
      const optionsRes = await fetch(`${API_URL}/api/auth/webauthn/generate-registration`, {
        headers: { 'Authorization': `Bearer ${loggedInToken}` }
      });
      const options = await optionsRes.json();

      if (!optionsRes.ok) throw new Error(options.error || "Failed to get challenge");

      const attestationResponse = await startRegistration({ optionsJSON: options });

      const verificationRes = await fetch(`${API_URL}/api/auth/webauthn/verify-registration`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${loggedInToken}`
        },
        body: JSON.stringify(attestationResponse)
      });

      const verification = await verificationRes.json();

      if (verificationRes.ok) {
        setToast({ open: true, message: 'Fingerprint/Face ID securely registered!', severity: 'success' });
      } else {
        setToast({ open: true, message: verification.error, severity: 'error' });
      }
    } catch (error) {
      console.error("🚨 BIOMETRICS ERROR:", error);
      
      if (error.name === 'NotAllowedError') {
         setToast({ open: true, message: 'Biometric setup cancelled.', severity: 'warning' });
      } else {
         setToast({ open: true, message: `Failed: ${error.message || error.name}`, severity: 'error' });
      }
    }
  };

  const handleGenerateCode = async () => {
    try {
      const response = await fetch(`${API_URL}/api/patient/generate-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${loggedInToken}` }
      });
      const data = await response.json();
      if (response.ok) {
        setAccessCode(data.code);
        setToast({ open: true, message: "Code generated successfully!", severity: 'success' });
      } else setToast({ open: true, message: data.error, severity: 'error' });
    } catch (error) { setToast({ open: true, message: "Failed to connect.", severity: 'error' }); }
  };

  const handleUnlockVault = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/doctor/access-vault`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${loggedInToken}` }, body: JSON.stringify({ code: vaultCode })
      });
      const data = await response.json();
      if (response.ok) {
        setUnlockedPatient(data.patient);
        setToast({ open: true, message: "Vault Unlocked", severity: 'success' });
      } else setToast({ open: true, message: data.error, severity: 'error' });
    } catch (error) { setToast({ open: true, message: "Failed to connect.", severity: 'error' }); }
  };

  const handleInjectRecord = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/doctor/records`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${loggedInToken}` }, body: JSON.stringify({ patientId: unlockedPatient.id, code: vaultCode, ...recordForm })
      });
      if (response.ok) {
        setToast({ open: true, message: "Record Injected!", severity: 'success' });
        setUnlockedPatient(null);
        setVaultCode('');
        setRecordForm({ diagnosis: '', treatment: '', notes: '' });
      } else {
        const data = await response.json();
        setToast({ open: true, message: data.error, severity: 'error' });
      }
    } catch (error) { setToast({ open: true, message: "Failed to save.", severity: 'error' }); }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setLoggedInToken(null);
    setUserRole(null);
    setPatientData(null);
    setDoctorData(null);
    setAccessCode(null);
    setPatientTab(0);
    setUnlockedPatient(null);
    setVaultCode('');
    setAuthRequest(null);
    
    // Clear 2FA States
    setRequires2FA(false);
    setTwoFactorToken('');
    setSetupStep('initial');
    setQrCodeUrl('');
    setSetupPin('');

    setToast({ open: true, message: "Logged out safely.", severity: 'info' });
  };

  const handleAuthDecision = (approved) => {
    socket.emit('auth-response', { code: authRequest.code, approved: approved, sharedRecordIds: selectedRecordIds });
    setAuthRequest(null);
    setPopupSearch('');
    setSelectedRecordIds([]);
  };

  const handleDownloadPDF = (profileData, recordsToPrint, role) => {
    if (!recordsToPrint || recordsToPrint.length === 0) {
      return setToast({ open: true, message: "No records to download.", severity: 'error' });
    }
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(9, 132, 227); 
    doc.text("TotalMed Secure Health Vault", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(45, 52, 54); 
    doc.text(`Official Medical Records Report`, 14, 32);
    doc.text(`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 14, 38);
    const titlePrefix = role === 'DOCTOR' ? 'Attending Physician: Dr.' : 'Patient File:';
    doc.text(`${titlePrefix} ${profileData.firstName} ${profileData.lastName}`, 14, 48);
    const tableColumn = ["Date", "Diagnosis", "Treatment Plan", "Attending Dr.", "Clinical Notes"];
    const tableRows = [];
    recordsToPrint.forEach(record => {
      tableRows.push([new Date(record.createdAt).toLocaleDateString(), record.diagnosis, record.treatment || "N/A", `Dr. ${record.doctor?.lastName || 'Unknown'}`, record.notes || "None"]);
    });
    autoTable(doc, {
      startY: 55, head: [tableColumn], body: tableRows, theme: 'grid',
      headStyles: { fillColor: [9, 132, 227], textColor: [255, 255, 255] }, styles: { fontSize: 9, cellPadding: 4 }, columnStyles: { 4: { cellWidth: 50 } } 
    });
    doc.save(`TotalMed_Export_${profileData.lastName}_${new Date().getTime()}.pdf`);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      
      {/* 1. DOCTOR VIEW */}
      {loggedInToken && userRole === 'DOCTOR' && (
        <div className="container">
          <AppBar position="static" sx={{ borderRadius: '8px', mb: 4, backgroundColor: '#0984e3', boxShadow: 3 }}>
            <Toolbar>
              <MedicalServicesIcon sx={{ mr: 2 }} />
              <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold', letterSpacing: '1px' }}>
                TotalMed Doctor Portal
              </Typography>
              <Button color="inherit" onClick={handleLogout} sx={{ fontWeight: 'bold' }}>Secure Logout</Button>
            </Toolbar>
          </AppBar>
          
          {!doctorData ? <p>Loading system...</p> : (
            <>
              <div className="card" style={{ backgroundColor: '#e8f4f8', color: '#2d3436' }}>
                <h3>Physician Profile</h3>
                <p><strong>Dr. {doctorData.firstName} {doctorData.lastName}</strong> | {doctorData.specialty}</p>
              </div>

              {!unlockedPatient ? (
                <div className="card" style={{ marginTop: '30px', backgroundColor: '#ffffff', textAlign: 'center', padding: '30px' }}>
                  <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1, color: '#2d3436' }}>🔑 Unlock Patient File</Typography>
                  <Typography sx={{ color: '#636e72', mb: 3 }}>Enter the 6-digit access code provided by the patient.</Typography>
                  
                  <Box component="form" onSubmit={handleUnlockVault} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <TextField label="6-Digit Vault Code" variant="outlined" value={vaultCode} onChange={(e) => setVaultCode(e.target.value)} inputProps={{ maxLength: 6, style: { fontSize: '1.5em', letterSpacing: '8px', textAlign: 'center' } }} required />
                    <Button type="submit" variant="contained" size="large" sx={{ backgroundColor: '#0984e3', px: 4 }}>Access Vault</Button>
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
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                        <Typography variant="h6" sx={{ color: '#0984e3', fontWeight: 'bold' }}>
                          📁 Shared Medical History ({unlockedPatient.medicalRecords.length} records)
                        </Typography>
                        {unlockedPatient.medicalRecords.length > 0 && (
                          <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={() => handleDownloadPDF(doctorData, unlockedPatient.medicalRecords, 'DOCTOR')}>Export as PDF</Button>
                        )}
                      </Box>
                      
                      {unlockedPatient.medicalRecords.length > 0 ? (
                        <List>
                          {unlockedPatient.medicalRecords.map((record) => (
                            <ListItem key={record.id} sx={{ borderBottom: '1px solid #dfe6e9', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', pb: 2, mb: 2 }}>
                               <Typography variant="subtitle1" sx={{ color: '#2d3436' }}><strong>Diagnosis:</strong> {record.diagnosis}</Typography>
                               <Typography variant="body2" sx={{ mt: 0.5 }}><strong>Treatment:</strong> {record.treatment}</Typography>
                               <Typography variant="body2" sx={{ mt: 0.5, color: '#636e72' }}><strong>Notes:</strong> {record.notes}</Typography>
                               <Typography variant="caption" sx={{ mt: 1, color: '#b2bec3' }}>Date: {new Date(record.createdAt).toLocaleDateString()} | Attending: Dr. {record.doctor?.lastName || 'Unknown'}</Typography>
                            </ListItem>
                          ))}
                        </List>
                      ) : (
                        <Typography sx={{ color: '#e17055', fontStyle: 'italic' }}>The patient chose not to share any prior medical records.</Typography>
                      )}
                    </Box>
                  )}

                  <h4 style={{ marginTop: '20px', color: '#2d3436' }}>Inject New Medical Record</h4>
                  <Box component="form" onSubmit={handleInjectRecord} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                    <TextField label="Diagnosis (Required)" required value={recordForm.diagnosis} onChange={(e) => setRecordForm({...recordForm, diagnosis: e.target.value})} fullWidth />
                    <TextField label="Treatment Plan" value={recordForm.treatment} onChange={(e) => setRecordForm({...recordForm, treatment: e.target.value})} fullWidth />
                    <TextField label="Clinical Notes" multiline rows={3} value={recordForm.notes} onChange={(e) => setRecordForm({...recordForm, notes: e.target.value})} fullWidth />
                    <Button type="submit" variant="contained" sx={{ backgroundColor: '#00b894', color: 'white', mt: 1, py: 1.5, fontSize: '1.1rem' }}>Save Record & Lock Vault</Button>
                  </Box>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 2. PATIENT VIEW */}
      {loggedInToken && userRole === 'PATIENT' && (
        <div className="container">
          <AppBar position="static" sx={{ borderRadius: '8px', mb: 4, backgroundColor: '#0984e3', boxShadow: 3 }}>
            <Toolbar>
              <MedicalServicesIcon sx={{ mr: 2 }} />
              <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold', letterSpacing: '1px' }}>TotalMed Patient Portal</Typography>
              <Button color="inherit" onClick={handleLogout} sx={{ fontWeight: 'bold' }}>Secure Logout</Button>
            </Toolbar>
          </AppBar>
          
          {!patientData ? <p>Loading your secure medical records...</p> : (
            <Box sx={{ width: '100%' }}>
              <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                <Tabs value={patientTab} onChange={(e, newValue) => setPatientTab(newValue)} textColor="primary" indicatorColor="primary">
                  <Tab label="Dashboard & Vault Key" sx={{ fontWeight: 'bold' }} />
                  <Tab label="Medical History" sx={{ fontWeight: 'bold' }} />
                </Tabs>
              </Box>

              {patientTab === 0 && (
                <Box>
                  <div className="card" style={{ backgroundColor: '#f8f9fa', color: '#2d3436' }}>
                    <h3>Patient Profile</h3>
                    <p><strong>Name:</strong> {patientData.firstName} {patientData.lastName}</p>
                    <p><strong>DOB:</strong> {new Date(patientData.dateOfBirth).toLocaleDateString()}</p>
                  </div>

                  {/* 2FA SECURITY DASHBOARD CARD */}
                  <div className="card" style={{ backgroundColor: '#fdfbfb', marginTop: '20px', border: '1px solid #dfe6e9' }}>
                    <h3>🔐 Two-Factor Authentication</h3>
                    <p style={{ color: '#636e72', fontSize: '0.9em' }}>Protect your vault with Google Authenticator.</p>
                    
                    {patientData?.user?.isTwoFactorEnabled || setupStep === 'success' ? (
                      <Typography sx={{ color: '#00b894', fontWeight: 'bold', mt: 2, fontSize: '1.2em' }}>
                        ✅ 2FA is securely enabled on this account.
                      </Typography>
                    ) : (
                      <>
                        {setupStep === 'initial' && (
                          <Button variant="outlined" onClick={handleStart2FASetup} sx={{ mt: 1 }}>Enable 2FA</Button>
                        )}
                        {setupStep === 'scan' && (
                          <Box sx={{ textAlign: 'center', mt: 2 }}>
                            <Typography sx={{ mb: 2 }}>Scan this QR code with your Authenticator App:</Typography>
                            <img src={qrCodeUrl} alt="QR Code" style={{ width: '180px', border: '10px solid white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                            <Typography sx={{ mt: 1, fontSize: '0.85em', color: '#636e72' }}>Manual Key: <strong>{twoFactorSecret}</strong></Typography>
                            
                            <Box component="form" onSubmit={handleVerify2FASetup} sx={{ display: 'flex', gap: 1, mt: 3, justifyContent: 'center' }}>
                              <TextField size="small" label="Enter 6-digit code" value={setupPin} onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, ''))} inputProps={{ maxLength: 6 }} required />
                              <Button type="submit" variant="contained" sx={{ backgroundColor: '#0984e3' }}>Verify</Button>
                            </Box>
                          </Box>
                        )}
                      </>
                    )}
                    <hr style={{ border: 'none', borderTop: '1px dashed #dfe6e9', margin: '30px 0 20px 0' }} />
                    
                    <h3>👆 Biometric Login</h3>
                    <p style={{ color: '#636e72', fontSize: '0.9em' }}>Register this device to log in with Fingerprint, Face ID, or Windows Hello.</p>
                    <Button 
                      variant="contained" 
                      onClick={handleEnableBiometrics} 
                      sx={{ mt: 1, backgroundColor: '#6c5ce7', '&:hover': { backgroundColor: '#a29bfe' }, textTransform: 'none' }}
                    >
                      Register Current Device
                    </Button>
                  </div>

                  <div className="card" style={{ backgroundColor: '#fff3cd', color: '#856404', marginTop: '20px', border: '2px dashed #ffeeba' }}>
                    <h3>🔐 Share Medical File</h3>
                    <p>Generate a temporary 6-digit code to allow a doctor to view your history and add new records. This code expires in 60 minutes.</p>
                    
                    {!accessCode ? (
                      <button onClick={handleGenerateCode} style={{ backgroundColor: '#f39c12', color: 'white', fontWeight: 'bold' }}>Generate Access Code</button>
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

              {patientTab === 1 && (
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, width: '100%', borderBottom: '2px solid #dfe6e9', paddingBottom: '10px', mb: 2 }}>
                    <h3 style={{ margin: 0, color: '#2d3436' }}>📁 Your Medical History</h3>
                    <Button variant="contained" startIcon={<PictureAsPdfIcon />} onClick={() => handleDownloadPDF(patientData, patientData.medicalRecords, 'PATIENT')} sx={{ backgroundColor: '#0984e3' }}>Download Vault PDF</Button>
                  </Box>
                  
                  {patientData.medicalRecords && patientData.medicalRecords.length > 0 ? (
                    patientData.medicalRecords.map((record) => (
                      <div key={record.id} className="card" style={{ borderLeft: '5px solid #0984e3', marginBottom: '15px', backgroundColor: '#ffffff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                          <h4 style={{ margin: 0, color: '#2d3436' }}>{record.diagnosis}</h4>
                          <span style={{ fontSize: '0.9em', color: '#636e72' }}>{new Date(record.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p style={{ margin: '5px 0', fontSize: '0.95em' }}><strong>Attending Physician:</strong> Dr. {record.doctor.lastName}</p>
                        {record.treatment && <p style={{ margin: '5px 0', fontSize: '0.95em' }}><strong>Treatment Plan:</strong> {record.treatment}</p>}
                        {record.notes && <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f1f2f6', borderRadius: '4px', fontSize: '0.9em', fontStyle: 'italic' }}>"{record.notes}"</div>}
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
            <DialogTitle sx={{ backgroundColor: '#0984e3', color: 'white', fontWeight: 'bold' }}>🚨 Access Request: {authRequest?.doctorName}</DialogTitle>
            <DialogContent sx={{ mt: 2 }}>
              <Typography sx={{ mb: 2, color: '#2d3436' }}>Please select the specific medical records you wish to share with this physician.</Typography>
              <TextField fullWidth size="small" label="Filter Diagnostics..." variant="outlined" value={popupSearch} onChange={(e) => setPopupSearch(e.target.value)} sx={{ mb: 2 }} />
              <Box sx={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #dfe6e9', borderRadius: '4px' }}>
                <List>
                  {(patientData?.medicalRecords || [])
                  .filter(record => record.diagnosis.toLowerCase().includes(popupSearch.toLowerCase()))
                  .map((record) => {
                      const isChecked = selectedRecordIds.includes(record.id);
                      return (
                        <ListItem key={record.id} button onClick={() => { isChecked ? setSelectedRecordIds(selectedRecordIds.filter(id => id !== record.id)) : setSelectedRecordIds([...selectedRecordIds, record.id]); }}>
                          <Checkbox checked={isChecked} color="primary" />
                          <ListItemText primary={<strong>{record.diagnosis}</strong>} secondary={`${new Date(record.createdAt).toLocaleDateString()} - Dr. ${record.doctor.lastName}`} />
                        </ListItem>
                      );
                  })}
                  {patientData?.medicalRecords?.length === 0 && <Typography sx={{ p: 2, color: '#636e72', fontStyle: 'italic', textAlign: 'center' }}>No medical records available to share.</Typography>}
                </List>
              </Box>
            </DialogContent>
            <DialogActions sx={{ p: 3, justifyContent: 'space-between', borderTop: '1px solid #dfe6e9' }}>
              <Button onClick={() => handleAuthDecision(false)} variant="outlined" color="error">Deny All Access</Button>
              <Button onClick={() => handleAuthDecision(true)} variant="contained" color="success">
                {patientData?.medicalRecords?.length === 0 ? "Grant Access to Empty Vault" : selectedRecordIds.length === 0 ? "Grant Access (Hide Past History)" : `Share ${selectedRecordIds.length} Selected Record(s)`}
              </Button>
            </DialogActions>
          </Dialog>
        </div>
      )}

      {/* 3. LOGIN VIEW */}
      {!loggedInToken && (
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <h1 style={{ color: '#0984e3', fontSize: '2.5em', margin: 0 }}>TotalMed</h1>
            <p style={{ color: '#636e72', marginTop: '5px' }}>Secure Ephemeral Health Vault</p>
          </div>

          <div className="card" style={{ maxWidth: '400px', margin: '0 auto', padding: '30px' }}>
            <Typography variant="h4" sx={{ mb: 3, textAlign: 'center', fontWeight: 'bold', color: '#2d3436' }}>
              {isLoginView ? 'Sign In' : 'Patient Registration'}
            </Typography>

            {requires2FA ? (
              <Box component="form" onSubmit={handle2FAValidation} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                
                {/* 2FA Method Selector Tabs */}
                {available2FAMethods.length > 1 && (
                  <Tabs 
                    value={selected2FAMethod} 
                    onChange={(e, newValue) => {
                      setSelected2FAMethod(newValue);
                      if (newValue === 'EMAIL' && !emailCodeSent) handleSendEmailCode();
                    }} 
                    centered 
                    sx={{ mb: 1 }}
                  >
                    <Tab label="Authenticator App" value="APP" />
                    <Tab label="Email OTP" value="EMAIL" />
                  </Tabs>
                )}

                <Typography sx={{ textAlign: 'center', color: '#2d3436', mb: 1, fontWeight: 'bold' }}>
                  {selected2FAMethod === 'APP' 
                    ? "🔒 Enter the 6-digit code from Google Authenticator" 
                    : "📧 Enter the 6-digit code sent to your email"}
                </Typography>

                <TextField 
                  label="6-Digit Code" 
                  value={twoFactorToken}
                  onChange={(e) => setTwoFactorToken(e.target.value.replace(/\D/g, ''))}
                  inputProps={{ maxLength: 6, style: { letterSpacing: '8px', textAlign: 'center', fontSize: '1.5em', fontWeight: 'bold' } }}
                  required 
                  fullWidth 
                  autoFocus
                />

                <Button type="submit" variant="contained" size="large" sx={{ mt: 1, backgroundColor: '#00b894', py: 1.5, fontSize: '1.1rem', textTransform: 'none' }}>
                  Verify & Access Vault
                </Button>

                {selected2FAMethod === 'EMAIL' && (
                   <Button onClick={() => handleSendEmailCode()} variant="text" sx={{ color: '#0984e3', textTransform: 'none' }}>
                     Didn't receive it? Resend Email
                   </Button>
                )}

                <Button onClick={() => { setRequires2FA(false); setEmailCodeSent(false); }} variant="text" sx={{ color: '#636e72', textTransform: 'none' }}>
                  Cancel & Return to Login
                </Button>
              </Box>
            ) : (
              <Box component="form" onSubmit={isLoginView ? handleLogin : handleRegister} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {!isLoginView && (
                  <>
                    <TextField label="First Name" name="firstName" onChange={handleChange} required fullWidth />
                    <TextField label="Last Name" name="lastName" onChange={handleChange} required fullWidth />
                    <DatePicker 
                      label="Date of Birth *"
                      disableFuture
                      value={formData.dateOfBirth ? dayjs(formData.dateOfBirth) : null}
                      onChange={(newValue) => setFormData({ ...formData, dateOfBirth: newValue ? newValue.format('YYYY-MM-DD') : '' })}
                      slotProps={{ textField: { fullWidth: true, required: true } }}
                    />
                    <TextField label="Phone Number" name="phone" type="tel" onChange={handleChange} required fullWidth />
                  </>
                )}
                <TextField label="Email Address" name="email" type="email" onChange={handleChange} required fullWidth />
                <TextField label="Password" name="password" type="password" onChange={handleChange} required fullWidth />
                {!isLoginView && (
                  <TextField label="Confirm Password" type="password" value={formData.confirmPassword} onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} required fullWidth />
                )}
                <Button type="submit" variant="contained" size="large" sx={{ mt: 1, backgroundColor: '#0984e3', py: 1.5, fontSize: '1.1rem', textTransform: 'none', borderRadius: '8px' }}>
                  {isLoginView ? 'Secure Login' : 'Register Patient'}
                </Button>
              </Box>
            )}

            {!requires2FA && (
              <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <Button variant="text" onClick={() => setIsLoginView(!isLoginView)} sx={{ textTransform: 'none', color: '#636e72' }}>
                  {isLoginView ? "New patient? Sign up here" : "Already have an account? Sign in"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={handleCloseToast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={handleCloseToast} severity={toast.severity || 'info'} sx={{ width: '100%', fontSize: '1.1rem', fontWeight: 'bold' }}>
          {toast.message}
        </Alert>
      </Snackbar>

    </LocalizationProvider>
  );
}

export default App;