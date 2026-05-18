import { useState, useEffect } from 'react'
import './App.css'

function App() {
  // 🔴 IMPORTANT: Keep your actual Render backend URL here!
  const API_URL = 'https://totalmed-backend.onrender.com'; 

  // UI & Security State
  const [isLoginView, setIsLoginView] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [loggedInToken, setLoggedInToken] = useState(localStorage.getItem('token') || null);
  const [userRole, setUserRole] = useState(localStorage.getItem('role') || null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // 👈 Forces the page to refresh when data changes
  
  // Dashboard Data State
  const [patientData, setPatientData] = useState(null);
  const [doctorData, setDoctorData] = useState(null);

  // Form States
  const [formData, setFormData] = useState({ email: '', password: '', firstName: '', lastName: '', dateOfBirth: '', phone: '' });
  const [visitForm, setVisitForm] = useState({ appointmentId: null, diagnosis: '', treatment: '', notes: '' });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // --- FETCH SECURE DASHBOARD DATA ---
  useEffect(() => {
    if (!loggedInToken) return;

    if (userRole === 'PATIENT') {
      fetch(`${API_URL}/api/patient/dashboard`, { headers: { 'Authorization': `Bearer ${loggedInToken}` } })
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => setPatientData(data))
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
      <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>🩺 TotalMed Doctor Portal</h2>
          <button onClick={handleLogout} style={{ backgroundColor: '#ff4757', color: 'white' }}>Log Out</button>
        </div>
        
        {!doctorData ? <p>Loading your secure schedule...</p> : (
          <>
            <div className="card" style={{ backgroundColor: '#e8f4f8', color: '#2d3436' }}>
              <h3>Physician Profile</h3>
              <p><strong>Name:</strong> Dr. {doctorData.firstName} {doctorData.lastName}</p>
              <p><strong>Specialty:</strong> {doctorData.specialty}</p>
            </div>

            <h3 style={{ marginTop: '30px' }}>Your Schedule</h3>
            {doctorData.appointments && doctorData.appointments.length > 0 ? (
              doctorData.appointments.map((apt) => (
                <div key={apt.id} className="card" style={{ borderLeft: apt.status === 'COMPLETED' ? '5px solid #b2bec3' : '5px solid #00b894', marginBottom: '10px' }}>
                  <h4 style={{ margin: '0 0 1