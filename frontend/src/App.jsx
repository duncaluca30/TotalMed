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
                  <h4 style={{ margin: '0 0 10px 0' }}>Patient: {apt.patient.firstName} {apt.patient.lastName}</h4>
                  <p style={{ margin: '5px 0' }}><strong>Time:</strong> {new Date(apt.dateTime).toLocaleString()}</p>
                  <p style={{ margin: '5px 0' }}><strong>Status:</strong> {apt.status}</p>
                  
                  {/* The Complete Visit Button & Form */}
                  {apt.status === 'SCHEDULED' && visitForm.appointmentId !== apt.id && (
                    <button onClick={() => setVisitForm({ ...visitForm, appointmentId: apt.id })} style={{ marginTop: '10px', backgroundColor: '#0984e3' }}>
                      Complete Visit & Add Notes
                    </button>
                  )}

                  {visitForm.appointmentId === apt.id && (
                    <form onSubmit={handleCompleteVisit} style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px', backgroundColor: '#f1f2f6', borderRadius: '5px' }}>
                      <input type="text" placeholder="Diagnosis (Required)" required onChange={(e) => setVisitForm({...visitForm, diagnosis: e.target.value})} />
                      <input type="text" placeholder="Treatment Plan (Optional)" onChange={(e) => setVisitForm({...visitForm, treatment: e.target.value})} />
                      <textarea placeholder="Doctor's Internal Notes (Optional)" rows="3" onChange={(e) => setVisitForm({...visitForm, notes: e.target.value})} />
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button type="submit" style={{ backgroundColor: '#00b894', color: 'white', flex: 1 }}>Save Record</button>
                        <button type="button" onClick={() => setVisitForm({ appointmentId: null, diagnosis: '', treatment: '', notes: '' })} style={{ backgroundColor: '#636e72', color: 'white' }}>Cancel</button>
                      </div>
                    </form>
                  )}
                </div>
              ))
            ) : <p>You have no scheduled appointments.</p>}
          </>
        )}
      </div>
    );
  }

  // ==========================================
  // 🏥 PATIENT DASHBOARD VIEW
  // ==========================================
  if (loggedInToken && userRole === 'PATIENT') {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>🏥 TotalMed Patient Portal</h2>
          <button onClick={handleLogout} style={{ backgroundColor: '#ff4757', color: 'white' }}>Log Out</button>
        </div>
        
        {!patientData ? <p>Loading your secure medical records...</p> : (
          <>
            <div className="card" style={{ backgroundColor: '#f8f9fa', color: '#2d3436' }}>
              <h3>Patient Profile</h3>
              <p><strong>Name:</strong> {patientData.firstName} {patientData.lastName}</p>
              <p><strong>DOB:</strong> {new Date(patientData.dateOfBirth).toLocaleDateString()}</p>
            </div>

            <h3 style={{ marginTop: '30px' }}>Upcoming Appointments</h3>
            {patientData.appointments && patientData.appointments.length > 0 ? (
              patientData.appointments.map((apt) => (
                <div key={apt.id} className="card" style={{ borderLeft: apt.status === 'COMPLETED' ? '5px solid #b2bec3' : '5px solid #0984e3', marginBottom: '10px' }}>
                  <h4 style={{ margin: '0 0 10px 0' }}>Dr. {apt.doctor.lastName}</h4>
                  <p style={{ margin: '5px 0' }}><strong>Date:</strong> {new Date(apt.dateTime).toLocaleString()}</p>
                  <p style={{ margin: '5px 0' }}><strong>Status:</strong> {apt.status}</p>
                </div>
              ))
            ) : <p>You have no appointments.</p>}
          </>
        )}
      </div>
    );
  }

  // ==========================================
  // 🔐 AUTHENTICATION VIEW
  // ==========================================
  return (
    <>
      <h1>TotalMed System</h1>
      <div className="card" style={{ maxWidth: '400px', margin: '0 auto', padding: '20px' }}>
        <h2>{isLoginView ? 'Sign In' : 'Patient Registration'}</h2>
        <form onSubmit={isLoginView ? handleLogin : handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {!isLoginView && (
            <>
              <input type="text" name="firstName" placeholder="First Name" onChange={handleChange} required />
              <input type="text" name="lastName" placeholder="Last Name" onChange={handleChange} required />
              <input type="date" name="dateOfBirth" onChange={handleChange} required />
              <input type="tel" name="phone" placeholder="Phone Number" onChange={handleChange} required />
            </>
          )}
          <input type="email" name="email" placeholder="Email Address" onChange={handleChange} required />
          <input type="password" name="password" placeholder="Password" onChange={handleChange} required />
          <button type="submit" style={{ marginTop: '10px' }}>
            {isLoginView ? 'Secure Login' : 'Register Patient'}
          </button>
        </form>
        <p style={{ marginTop: '15px', color: '#ff4757', fontWeight: 'bold' }}>{statusMessage}</p>
        <p style={{ marginTop: '20px', fontSize: '0.9em' }}>
          {isLoginView ? "New patient? " : "Already registered? "}
          <button type="button" onClick={() => setIsLoginView(!isLoginView)} style={{ background: 'none', border: 'none', color: '#3498db', cursor: 'pointer', textDecoration: 'underline' }}>
            {isLoginView ? 'Sign up here' : 'Log in here'}
          </button>
        </p>
      </div>
    </>
  )
}

export default App