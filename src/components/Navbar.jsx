import { useLocation } from 'react-router-dom'

const TITLES = {
  '/':       'AARRR Pirate Metrics',
  '/users':  'User Access Management',
}

export default function Navbar() {
  const location = useLocation()
  const title = TITLES[location.pathname] ?? 'Dashboard'

  return (
    <header className="navbar">
      <span className="navbar-title">{title}</span>
      <div className="navbar-right">
        <span className="navbar-live-dot">Live</span>
        <span style={{ fontSize: 12 }}>JobHackers.Global</span>
      </div>
    </header>
  )
}
