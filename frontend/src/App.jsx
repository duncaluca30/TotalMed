import { useState } from 'react'
import './App.css'

function App() {
  const API_URL = 'https://totalmed-backend.onrender.com'; 

  // UI State
  const [isLoginView, setIsLoginView] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [loggedInToken, setLoggedInToken] = useState(localStorage.getItem('token') || null);

  // Form Data State
  const [formData, setFormData] = useState({
    email: '', password: '', firstName: '', lastName: '', dateOfBirth: '', phone: ''
  });

  // Handle typing in the input boxes
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

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
        setIsLoginView(true); // Flip back to login screen
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
        // Save the VIP token to the browser's memory
        localStorage.setItem('token', data.token);
        setLoggedInToken(data.token);
        setStatusMessage('✅ Logged in successfully!');
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
    setStatusMessage('Logged out.');
  };

  // --- DASHBOARD VIEW (If already logged in) ---
  if (loggedInToken) {
    return (
      <div className="card">
        <h2>🏥 TotalMed Dashboard</h2>
        <h3 style={{ color: 'green' }}>{statusMessage}</h3>
        <p>Your secure session token is active.</p>
        <button onClick={handleLogout} style={{ backgroundColor: 'red', color: 'white' }}>Log Out</button>
      </div>
    );
  }

  // --- AUTHENTICATION VIEW (If not logged in) ---
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