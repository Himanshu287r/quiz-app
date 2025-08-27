import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div>
      <p>Welcome! Choose your role to begin:</p>
      <div style={{ display: 'flex', gap: 16 }}>
        <Link to="/teacher">I am a Teacher</Link>
        <Link to="/student">I am a Student</Link>
      </div>
    </div>
  );
}

