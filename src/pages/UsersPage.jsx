import { useState, useEffect } from 'react'
import { useAuth }    from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase }   from '../supabase'

export default function UsersPage() {
  const { role, user }  = useAuth()
  const navigate         = useNavigate()

  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  // Invite form state
  const [inviteEmail,   setInviteEmail]   = useState('')
  const [inviteName,    setInviteName]    = useState('')
  const [invitePass,    setInvitePass]    = useState('')
  const [inviteRole,    setInviteRole]    = useState('viewer')
  const [inviting,      setInviting]      = useState(false)
  const [inviteError,   setInviteError]   = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  // Guard: only admins
  useEffect(() => {
    if (role !== null && role !== 'admin') navigate('/')
  }, [role, navigate])

  async function loadUsers() {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setUsers(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (role === 'admin') loadUsers()
  }, [role])

  async function handleInvite(e) {
    e.preventDefault()
    setInviting(true)
    setInviteError('')
    setInviteSuccess('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch('/api/users', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${token}`,
        },
        body: JSON.stringify({
          email:     inviteEmail,
          password:  invitePass,
          full_name: inviteName,
          role:      inviteRole,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to create user')
      }
      setInviteSuccess(`✅ ${inviteEmail} has been added.`)
      setInviteEmail(''); setInviteName(''); setInvitePass(''); setInviteRole('viewer')
      loadUsers()
    } catch (e) {
      setInviteError(e.message)
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove(userId, email) {
    if (!window.confirm(`Remove ${email} from dashboard access?`)) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (userId === user?.id) { alert("You can't remove yourself."); return }

      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to remove user')
      }
      loadUsers()
    } catch (e) {
      alert(e.message)
    }
  }

  function initials(name, email) {
    if (name) return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    return (email?.[0] ?? '?').toUpperCase()
  }

  if (role === null) return <div className="spinner-wrap"><div className="spinner" /></div>

  return (
    <div>
      <div className="page-header">
        <h1>👥 User Access Management</h1>
        <p>Control who can view the JHG dashboard</p>
      </div>

      <div className="users-grid">
        {/* User list */}
        <div className="page-section">
          <h2 className="page-section-title">Current Users</h2>

          {error && <div className="form-error">{error}</div>}

          {loading ? (
            <div className="spinner-wrap"><div className="spinner" /></div>
          ) : users.length === 0 ? (
            <div className="empty-state"><p>No users yet.</p></div>
          ) : (
            users.map(u => (
              <div key={u.id} className="user-row">
                <div className="user-avatar">{initials(u.full_name, u.email)}</div>
                <div className="user-info">
                  <div className="user-name">{u.full_name || '—'}</div>
                  <div className="user-email">{u.email}</div>
                </div>
                <span className={`role-badge ${u.role}`}>{u.role}</span>
                {u.id !== user?.id && (
                  <button className="btn-danger" onClick={() => handleRemove(u.id, u.email)}>
                    Remove
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Invite form */}
        <div className="page-section">
          <h2 className="page-section-title">Add User</h2>

          {inviteSuccess && <div className="alert-success">{inviteSuccess}</div>}
          {inviteError   && <div className="form-error">{inviteError}</div>}

          <form className="invite-form" onSubmit={handleInvite}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="First Last"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Temporary Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="min 8 characters"
                value={invitePass}
                onChange={e => setInvitePass(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Role</label>
              <select
                className="filter-select"
                style={{ width: '100%' }}
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <button type="submit" className="btn-secondary" disabled={inviting}>
              {inviting ? 'Adding…' : '+ Add User'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
