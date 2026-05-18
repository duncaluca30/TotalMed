import { useState, useEffect } from 'react'
import './App.css'

function App() {
  // 🔴 IMPORTANT: Keep your actual Render backend URL here!
  const API_URL = 'https://totalmed-backend.onrender.com'; 

  // UI State
  const [isLoginView, setIsLoginView] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [loggedInToken, setLoggedInToken] = useState(localStorage.getItem('token') || null);
  
  // Dashboard Data State
  const [patientData, setPatientData] = useState(null);

  // Form Data State
  const [formData, setFormData] = useState({
    email: '', password: '', firstName: '', lastName: '', dateOfBirth: '', phone: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // --- FETCH SECURE DASHBOARD DATA ---
  // This runs automatically whenever someone logs in
  useEffect(() => {
    if (loggedInToken) {
      fetch(`${API_URL}/api/patient/dashboard`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${loggedInToken}` // 👈 Here is the VIP Pass!
        }
      })
      .then(response => {
        if (!response.ok) throw new Error("Failed to authenticate token");
        return response.json();
      })
      .then(data => setPatientData(data))
      .catch(error => {
        console.error(error);
        handleLogout(); // If the token is fake or expired, kick them out!
      });
    }
  }, [loggedInToken]);

  // --- SUBMIT REGISTRATION ---
  const handleRegister = async (e) => {
    e.preventDefault();
    setStatusMessage('Registering...');
    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await response.json();
      
      if (response.ok) {
        setStatusMessage('✅ Registration successful! You can now log in.');
        setIsLoginView(true);
      } else {
        setStatusMessage(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      setStatusMessage('❌ Failed to connect to server.');
    }
  };

  // --- SUBMIT LOGIN ---
  const handleLogin = async (e) => {
    e.preventDefault();
    setStatusMessage('Logging in...');
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, password: formData.password })
      });
      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('token', data.token);
        setLoggedInToken(data.token);
        setStatusMessage('');
      } else {
        setStatusMessage(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      setStatusMessage('❌ Failed to connect to server.');
    }
  };

  // --- LOGOUT ---
  const handleLogout = () => {
    localStorage.removeItem('token');
    setLoggedInToken(null);
    setPatientData(null);
    setStatusMessage('Logged out safely.');
  };

  // ==========================================
  // 🏥 DASHBOARD VIEW (If logged in)
  // ==========================================
  if (loggedInToken) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>🏥 TotalMed Patient Portal</h2>
          <button onClick={handleLogout} style={{ backgroundColor: '#ff4757', color: 'white' }}>Log Out</button>
        </div>
        
        {!patientData ? (
          <p>Loading your secure medical records...</p>
        ) : (
          <>
            <div className="card" style={{ backgroundColor: '#f8f9fa', color: '#2d3436' }}>
              <h3>Patient Profile</h3>
              <p><strong>Name:</strong> {patientData.firstName} {patientData.lastName}</p>
              <p><strong>DOB:</strong> {new Date(patientData.dateOfBirth).toLocaleDateString()}</p>
              <p><strong>Phone:</strong> {patientData.phone}</p>
            </div>

            <h3 style={{ marginTop: '30px' }}>Upcoming Appointments</h3>
            {patientData.appointments && patientData.appointments.length > 0 ? (
              patientData.appointments.map((apt) => (
                <div key={apt.id} className="card" style={{ borderLeft: '5px solid #0984e3', marginBottom: '10px' }}>
                  <h4 style={{ margin: '0 0 10px 0' }}>Dr. {apt.doctor.lastName} ({apt.doctor.specialty})</h4>
                  <p style={{ margin: '5px 0' }}><strong>Date:</strong> {new Date(apt.dateTime).toLocaleString()}</p>
                  <p style={{ margin: '5px 0' }}><strong>Status:</strong> {apt.status}</p>
                  {apt.reason && <p style={{ margin: '5px 0' }}><strong>Reason:</strong> {apt.reason}</p>}
                </div>
              ))
            ) : (
              <p>You have no upcoming appointments.</p>
            )}
          </>
        )}
      </div>
    );
  }

  // ==========================================
  // 🔐 AUTHENTICATION VIEW (If NOT logged in)
  // ==========================================
  return (
    <>
      <h1>TotalMed System</h1>
      <div className="card" style={{ maxWidth: '400px', margin: '0 auto', padding: '20px' }}>
        <h2>{isLoginView ? 'Sign In' : 'Create Account'}</h2>
        
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
          {isLoginView ? "Don't have an account? " : "Already have an account? "}
          <button 
            type="button" 
            onClick={() => setIsLoginView(!isLoginView)} 
            style={{ background: 'none', border: 'none', color: '#3498db', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isLoginView ? 'Sign up here' : 'Log in here'}
          </button>
        </p>
      </div>
    </>
  )
}

export default App