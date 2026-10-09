import { useLocation } from 'react-router-dom'

const TITLES = {
  '/':            'AARRR Pirate Metrics',
  '/custom':      'Custom Dashboards',
  '/experiments': 'Experiments',
  '/people':      'People',
  '/intent':      'Buying Intent',
  '/users':       'User Access Management',
  '/settings':    'Settings',
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
