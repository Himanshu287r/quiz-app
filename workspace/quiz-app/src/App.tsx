import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import './App.css'
import Home from './pages/Home'
import TeacherSetup from './pages/TeacherSetup'
import TeacherRoom from './pages/TeacherRoom'
import StudentJoin from './pages/StudentJoin'
import StudentRoom from './pages/StudentRoom'

function App() {
  return (
    <BrowserRouter>
      <div id="app-shell" style={{ maxWidth: 1000, margin: '0 auto', padding: 16 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <h1 style={{ margin: 0 }}>Quiz & Assessment</h1>
          </Link>
          <nav style={{ display: 'flex', gap: 12 }}>
            <Link to="/teacher">Teacher</Link>
            <Link to="/student">Student</Link>
          </nav>
        </header>
        <main style={{ marginTop: 24 }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/teacher" element={<TeacherSetup />} />
            <Route path="/teacher/room/:roomId" element={<TeacherRoom />} />
            <Route path="/student" element={<StudentJoin />} />
            <Route path="/student/room/:roomId" element={<StudentRoom />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
