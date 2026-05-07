import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [backendMessage, setBackendMessage] = useState('Loading backend status...')
  const [dbMessage, setDbMessage] = useState('')

  useEffect(() => {
    // This makes the frontend "call" the backend door
    fetch('http://localhost:5000/api/status')
      .then(response => response.json())
      .then(data => {
        setBackendMessage(data.message);
        setDbMessage(data.database);
      })
      .catch(error => {
        console.error("Fetch error:", error);
        setBackendMessage("🚨 Cannot connect to backend server!");
      });
  }, []);

  return (
    <>
      <h1>TotalMed System</h1>
      <div className="card">
        <h2>Backend: {backendMessage}</h2>
        <h3 style={{ color: 'green' }}>Database: {dbMessage}</h3>
      </div>
    </>
  )
}

export default App