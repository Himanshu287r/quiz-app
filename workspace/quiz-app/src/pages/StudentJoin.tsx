import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAppStore from '../store/useAppStore';

export default function StudentJoin() {
  const navigate = useNavigate();
  const { joinRoom, loading } = useAppStore();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  async function handleJoin() {
    await joinRoom(code.trim().toUpperCase(), name.trim());
    const roomId = useAppStore.getState().currentRoom?.id;
    if (roomId) navigate(`/student/room/${roomId}`);
  }

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
      <label>
        Room code
        <input value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button onClick={handleJoin} disabled={loading || !code || !name}>
        {loading ? 'Joining...' : 'Join'}
      </button>
    </div>
  );
}

