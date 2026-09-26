import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight, Bell, Building2, CalendarCheck2, ChevronRight, CircleDollarSign,
  Compass, Crosshair, Flame, LayoutDashboard, ListChecks, LoaderCircle, LogOut,
  MapPinned, Menu, Pencil, Plus, Search, Sparkles, Target, Trash2, UserCheck, UserX, Users, X
} from 'lucide-react';
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from './api.js';

const navItems = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'followups', label: 'Follow-ups', icon: ListChecks },
  { id: 'customers', label: 'Customers', icon: Building2 },
  { id: 'sales', label: 'Sales ledger', icon: CircleDollarSign },
  { id: 'navigator', label: 'Smart navigator', icon: Compass },
  { id: 'history', label: 'Location history', icon: MapPinned },
];
const adminNavItems = [
  { id: 'dashboard', label: 'Control room', icon: LayoutDashboard },
  { id: 'team', label: 'Sales team', icon: Users },
  { id: 'customers', label: 'Customer book', icon: Building2 },
  { id: 'sales', label: 'Revenue ledger', icon: CircleDollarSign },
];
const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);
const dateTime = (value) => value ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '—';
const day = (value) => value ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
const sameDay = (value) => new Date(value).toDateString() === new Date().toDateString();
const isOverdue = (item) => item.status === 'Open' && new Date(item.dueDate) < new Date(new Date().setHours(0, 0, 0, 0));
function gpsDistanceKm(first, second) {
  const firstCoordinates = first?.location?.coordinates;
  const secondCoordinates = second?.location?.coordinates;
  if (!firstCoordinates || !secondCoordinates) return null;
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const [firstLongitude, firstLatitude] = firstCoordinates;
  const [secondLongitude, secondLatitude] = secondCoordinates;
  const latitudeDelta = radians(secondLatitude - firstLatitude);
  const longitudeDelta = radians(secondLongitude - firstLongitude);
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(firstLatitude)) * Math.cos(radians(secondLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return Number((6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))).toFixed(1));
}

function Brand() {
  return <div className="brand"><span className="brand-mark"><Compass size={21} /></span><span>sales<span>compass</span></span></div>;
}

function Chip({ children, tone = '' }) { return <span className={`chip ${tone}`}>{children}</span>; }

function Avatar({ name = '?' }) { return <span className="avatar">{name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span>; }

function Modal({ title, children, onClose }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">SALES COMPASS</p><h2>{title}</h2></div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button></div>{children}</section></div>;
}

function Field({ label, children, wide = false }) { return <label className={`field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>; }

function App() {
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem('sales-compass-session')); } catch { return null; } });
  const [page, setPage] = useState('dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [overview, setOverview] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [sales, setSales] = useState([]);
  const [suggestions, setSuggestions] = useState(null);
  const [locations, setLocations] = useState([]);
  const [locationHistory, setLocationHistory] = useState([]);
  const [team, setTeam] = useState([]);
  const [modal, setModal] = useState(null);
  const [locationState, setLocationState] = useState('Waiting for location consent');
  const [sharingLocation, setSharingLocation] = useState(false);
  const locationWatch = useRef(null);
    const [currentLocation, setCurrentLocation] = useState(null);
  const [globalSearch, setGlobalSearch] = useState('');

  const token = session?.token;
  const user = session?.user;
  const request = (path, options) => api(path, { ...options, token });
  const flash = (message) => { setNotice(message); window.setTimeout(() => setNotice(''), 3500); };

  async function loadData({ quiet = false } = {}) {
    if (!token) return;
    if (!quiet) setLoading(true);
    try {
      const calls = [request('/dashboard/overview'), request('/customers'), request('/followups'), request('/sales'), request('/dashboard/suggestions')];
      const admin = user.role === 'admin';
      if (admin) calls.push(request('/locations/latest'), request('/auth/team'));
      calls.push(request('/locations/history'));
      const results = await Promise.all(calls);
      const [overviewData, customerData, followUpData, saleData, suggestionData] = results;
      const locationData = admin ? results[5] : null;
      const teamData = admin ? results[6] : null;
      const historyData = results[admin ? 7 : 5];
      setOverview(overviewData); setCustomers(customerData); setFollowUps(followUpData); setSales(saleData); setSuggestions(suggestionData); if (locationData) setLocations(locationData); if (teamData) setTeam(teamData); if (historyData) setLocationHistory(historyData);
    } catch (error) { flash(error.message); }
    finally { setLoading(false); }
  }

  async function postLocation(position) {
    try {
      const { latitude, longitude, accuracy } = position.coords;
      const savedLocation = await request('/locations/ping', { method: 'POST', body: { latitude, longitude, accuracy } });
      setLocationHistory((current) => {
        if (current.some((entry) => String(entry._id) === String(savedLocation._id))) return current;
        const previous = current.find((entry) => new Date(entry.recordedAt).toDateString() === new Date(savedLocation.recordedAt).toDateString());
        const distanceFromPreviousKm = previous ? gpsDistanceKm(previous, savedLocation) : null;
        return [{ ...savedLocation, user: { _id: user.id, name: user.name }, distanceFromPreviousKm }, ...current].slice(0, 10000);
      });
        setCurrentLocation({ latitude, longitude, recordedAt: new Date().toISOString() });
      request('/dashboard/suggestions').then(setSuggestions).catch(() => {});
      setSharingLocation(true);
      setLocationState('Live location active');
    } catch (error) { setLocationState(`Location save failed: ${error.message || 'Check your connection and try again.'}`); }
  }
  function startLocation() {
    if (!navigator.geolocation) return setLocationState('Location is not supported by this browser');
    if (locationWatch.current !== null) navigator.geolocation.clearWatch(locationWatch.current);
    setSharingLocation(true);
    setLocationState('Checking your location…');
    locationWatch.current = navigator.geolocation.watchPosition(postLocation, () => { setSharingLocation(false); setLocationState('Location access is off'); }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 });
  }
  function stopLocation() {
    if (locationWatch.current !== null) navigator.geolocation.clearWatch(locationWatch.current);
    locationWatch.current = null;
    setSharingLocation(false);
    setLocationState('Location sharing paused');
  }
  useEffect(() => {
    if (!token) return undefined;
    loadData();
    if (user.role === 'admin') {
      const interval = window.setInterval(() => loadData({ quiet: true }), 15000);
      return () => window.clearInterval(interval);
    }
    startLocation();
    return () => { if (locationWatch.current !== null) navigator.geolocation?.clearWatch(locationWatch.current); locationWatch.current = null; };
  }, [token, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchedCustomers = useMemo(() => !globalSearch ? customers : customers.filter((customer) => [customer.company, customer.contactName, customer.city].join(' ').toLowerCase().includes(globalSearch.toLowerCase())), [customers, globalSearch]);
  const todayCount = followUps.filter((item) => sameDay(item.dueDate) && item.status === 'Open').length;

  async function signOut() {
    if (locationWatch.current !== null) navigator.geolocation?.clearWatch(locationWatch.current);
    locationWatch.current = null;
    if (user.role === 'sales' && sharingLocation) {
      await request('/locations/stop', { method: 'POST' }).catch(() => {});
      setSharingLocation(false);
    }
    localStorage.removeItem('sales-compass-session'); setSession(null); setOverview(null);
  }
  function navigate(next) { setPage(next); setMobileNav(false); }
  async function completeFollowUp(item) { try { await request(`/followups/${item._id}`, { method: 'PATCH', body: { status: 'Completed', outcome: 'Completed from Sales Compass' } }); flash('Follow-up marked complete. Great work.'); loadData({ quiet: true }); } catch (error) { flash(error.message); } }
  async function submitCustomer(event) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await request('/customers', { method: 'POST', body: values }); setModal(null); flash('Customer added to your book.'); loadData({ quiet: true }); } catch (error) { flash(error.message); }
  }
  async function submitFollowUp(event) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await request('/followups', { method: 'POST', body: values }); setModal(null); flash('Follow-up scheduled.'); loadData({ quiet: true }); } catch (error) { flash(error.message); }
  }
  async function submitSale(event) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); values.amount = Number(values.amount);
    try { await request(modal.sale ? `/sales/${modal.sale._id}` : '/sales', { method: modal.sale ? 'PATCH' : 'POST', body: values }); setModal(null); flash(modal.sale ? 'Sale updated.' : 'Sale saved to the ledger.'); loadData({ quiet: true }); } catch (error) { flash(error.message); }
  }
  async function deleteCustomer(customer) { if (!window.confirm(`Delete ${customer.company}?`)) return; try { await request(`/customers/${customer._id}`, { method: 'DELETE' }); setModal(null); flash('Customer deleted.'); loadData({ quiet: true }); } catch (error) { flash(error.message); } }
  async function deleteSale(sale) { if (!window.confirm(`Delete the sale for ${sale.customer?.company || 'this customer'}?`)) return; try { await request(`/sales/${sale._id}`, { method: 'DELETE' }); flash('Sale deleted.'); loadData({ quiet: true }); } catch (error) { flash(error.message); } }
  async function toggleTeamMember(member) { if (member._permanent) return deleteTeamMember(member); const action = member.active === false ? 'reactivate' : 'deactivate'; if (!window.confirm(`${action[0].toUpperCase()}${action.slice(1)} ${member.name}?`)) return; try { const updated = await request(`/auth/team/${member._id}`, { method: 'DELETE' }); setTeam((current) => current.map((item) => item._id === member._id ? { ...item, active: updated.active } : item)); flash(`${member.name} ${updated.active ? 'reactivated' : 'deactivated'}.`); } catch (error) { flash(error.message); } }
  async function deleteTeamMember(member) { if (!window.confirm(`Permanently delete ${member.name}? Historical location records will be retained, while business records will be kept unassigned.`)) return; try { await request(`/auth/team/${member._id}/permanent`, { method: 'DELETE' }); setTeam((current) => current.filter((item) => item._id !== member._id)); setLocations((current) => current.filter((item) => String(item.user?._id) !== String(member._id))); flash(`${member.name} was permanently deleted. Location history was retained.`); } catch (error) { flash(error.message); } }
  async function submitProfile(event) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const path = modal.profile._id && isAdmin ? `/auth/team/${modal.profile._id}` : '/auth/me';
      const updated = await request(path, { method: 'PATCH', body: values });
      if (modal.profile._id && isAdmin) setTeam((current) => current.map((member) => member._id === updated.id ? { ...member, ...updated, _id: updated.id } : member));
      else { const nextSession = { ...session, user: updated }; localStorage.setItem('sales-compass-session', JSON.stringify(nextSession)); setSession(nextSession); }
      setModal(null); flash('Account details updated.'); loadData({ quiet: true });
    } catch (error) { flash(error.message); }
  }
  async function submitCustomerEdit(event) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); values.value = Number(values.value);
    try { await request(`/customers/${modal.customer._id}`, { method: 'PATCH', body: values }); setModal(null); flash('Customer details updated.'); loadData({ quiet: true }); } catch (error) { flash(error.message); }
  }

  if (!session) return <Login onLogin={(nextSession) => { localStorage.setItem('sales-compass-session', JSON.stringify(nextSession)); setSession(nextSession); }} />;
  const isAdmin = user.role === 'admin';
  const items = isAdmin ? adminNavItems : navItems;
  return <div className={`app-shell ${isAdmin ? 'admin-shell' : 'sales-shell'}`}>
    <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}><div className="sidebar-top"><Brand /><button className="mobile-close icon-btn" onClick={() => setMobileNav(false)}><X size={20} /></button></div><button className="workspace-pill account-trigger" onClick={() => setModal({ type: 'profile', profile: user })}><span className="pulse-dot" /><span><b>{user.territory}</b><small>Open account profile</small></span></button><nav>{items.map((item) => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={19} />{item.label}{item.id === 'followups' && todayCount > 0 && <em>{todayCount}</em>}</button>; })}</nav><div className="sidebar-bottom"><button className="identity account-trigger" onClick={() => setModal({ type: 'profile', profile: user })}><Avatar name={user.name} /><span><b>{user.name}</b><small>{user.role === 'admin' ? 'Administrator' : 'Sales executive'}</small></span></button><button className="signout" onClick={signOut}><LogOut size={17} /> Sign out</button></div></aside>
    {mobileNav && <div className="nav-scrim" onClick={() => setMobileNav(false)} />}
    <main><header className="topbar"><div className="heading"><button className="hamburger icon-btn" onClick={() => setMobileNav(true)}><Menu size={22} /></button><div><p className="eyebrow">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>{page === 'dashboard' ? (isAdmin ? 'Operations control room' : `Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${user.name.split(' ')[0]}`) : items.find((item) => item.id === page)?.label}</h1></div></div><div className="header-actions"><label className="search"><Search size={18} /><input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Search customers" /></label><button className="icon-btn bell"><Bell size={20} />{todayCount > 0 && <i />}</button>{!isAdmin && <button className="primary quick-add" onClick={() => setModal({ type: 'followup' })}><Plus size={18} /> Add follow-up</button>}</div></header>
      <div className="content">{loading && !overview ? <div className="loading"><LoaderCircle className="spin" size={28} /> Loading your workspace…</div> : <>{page === 'dashboard' && (isAdmin ? <AdminDashboard overview={overview} team={team} locations={locations} customers={customers} sales={sales} onPage={navigate} /> : <Dashboard overview={overview} followUps={followUps} suggestions={suggestions} onPage={navigate} onCreate={(type, data) => setModal({ type, data })} onComplete={completeFollowUp} />)} {!isAdmin && page === 'followups' && <FollowUps items={followUps} onComplete={completeFollowUp} onCreate={() => setModal({ type: 'followup' })} />} {page === 'customers' && <Customers items={searchedCustomers} onCreate={() => setModal({ type: 'customer' })} onOpen={(customer) => setModal({ type: 'customer-detail', customer })} />} {page === 'sales' && <Sales items={sales} onCreate={() => setModal({ type: 'sale' })} onEdit={(sale) => setModal({ type: 'sale-edit', sale })} onDelete={deleteSale} />} {!isAdmin && page === 'navigator' && <Navigator suggestions={suggestions} locationState={locationState} sharingLocation={sharingLocation} currentLocation={currentLocation} onLocate={startLocation} onStopLocate={stopLocation} onSchedule={(customer) => setModal({ type: 'followup', data: { customer: customer._id } })} />} {!isAdmin && page === 'history' && <LocationHistory history={locationHistory} own />} {isAdmin && page === 'team' && <><Team locations={locations} team={team} onOpen={(profile) => setModal({ type: 'profile', profile })} onToggle={toggleTeamMember} /><LiveLocationMap locations={locations} title="Live team movement" /><LocationHistory history={locationHistory} /></>}</>}</div>
    {!isAdmin && page === 'navigator' && <LiveLocationMap currentLocation={currentLocation} title="Your moving location" />}
    </main>
    {notice && <div className="toast"><Sparkles size={17} />{notice}</div>}
    {modal?.type === 'customer' && <CustomerForm onClose={() => setModal(null)} onSubmit={submitCustomer} />}
    {modal?.type === 'followup' && <FollowUpForm onClose={() => setModal(null)} onSubmit={submitFollowUp} customers={customers} preset={modal.data} />}
    {modal?.type === 'sale' && <SaleForm onClose={() => setModal(null)} onSubmit={submitSale} customers={customers} />}
    {modal?.type === 'sale-edit' && <SaleForm sale={modal.sale} onClose={() => setModal(null)} onSubmit={submitSale} customers={customers} />}
    {modal?.type === 'profile' && <ProfileModal profile={modal.profile} canEdit={isAdmin || modal.profile.id === user.id} onClose={() => setModal(null)} onSubmit={submitProfile} />}
    {modal?.type === 'customer-detail' && <CustomerDetail customer={modal.customer} canEdit={isAdmin || String(modal.customer.owner?._id) === String(user.id)} onClose={() => setModal(null)} onEdit={() => setModal({ type: 'customer-edit', customer: modal.customer })} onDelete={() => deleteCustomer(modal.customer)} />}
    {modal?.type === 'customer-edit' && <CustomerEditForm customer={modal.customer} onClose={() => setModal(null)} onSubmit={submitCustomerEdit} />}
  </div>;
}

function LiveLocationMap({ locations = [], currentLocation, userId, title }) {
  const [selectedUserId, setSelectedUserId] = useState(userId || locations[0]?.user?._id || '');
  const activeUserId = userId || selectedUserId;
  const visibleLocations = activeUserId ? locations.filter((pin) => String(pin.user?._id) === String(activeUserId)) : locations;
  const markers = currentLocation ? [{ id: 'self', name: 'Your live location', latitude: currentLocation.latitude, longitude: currentLocation.longitude, live: true }] : visibleLocations.map((pin) => ({ id: pin.user?._id, name: pin.user?.name || 'Salesperson', latitude: pin.location?.location?.coordinates?.[1], longitude: pin.location?.location?.coordinates?.[0], live: pin.live, placeName: pin.location?.placeName }));
  const validMarkers = markers.filter((marker) => Number.isFinite(marker.latitude) && Number.isFinite(marker.longitude));
  const marker = validMarkers[0];
  const center = marker ? [marker.latitude, marker.longitude] : null;
  const selectedName = marker?.name || visibleLocations[0]?.user?.name || 'Salesperson';
  const lastUpdated = currentLocation?.recordedAt || visibleLocations[0]?.location?.recordedAt;
  const mapUrl = marker ? `https://www.google.com/maps/search/?api=1&query=${marker.latitude},${marker.longitude}` : null;
  return <section className="panel live-map-panel">
    <div className="panel-head">
      <div><p className="eyebrow">LIVE LOCATION SHARING</p><h2>{title}</h2><p className="muted">See the latest reported position or open it in Google Maps for directions.</p></div>
      <div className="live-map-tools">
        {locations.length > 0 && !currentLocation && <label className="live-map-picker"><span>Track salesperson</span><select aria-label="Track salesperson" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>{locations.map((pin) => <option value={pin.user?._id} key={pin.user?._id}>{pin.user?.name || 'Salesperson'}</option>)}</select></label>}
        <Chip tone={marker?.live ? 'active' : 'stale'}>{marker?.live ? 'Live now' : 'Last known'}</Chip>
      </div>
    </div>
    {marker ? <>
      <div className="live-location-summary">
        <span className={`live-status-dot ${marker.live ? 'is-live' : ''}`} />
        <div><b>{selectedName}</b><span>{marker.placeName || 'GPS position'}</span></div>
        <small>{lastUpdated ? `Updated ${dateTime(lastUpdated)}` : 'Waiting for first location'}</small>
        {mapUrl && <a className="map-link live-map-open" href={mapUrl} target="_blank" rel="noreferrer"><MapPinned size={15} /> Open in Google Maps <ArrowUpRight size={14} /></a>}
      </div>
      <div className="live-map">
        <MapContainer center={center} zoom={16} scrollWheelZoom={false} dragging={false} doubleClickZoom={false} touchZoom={false} zoomControl={false} keyboard={false}>
          <RecenterMap center={center} />
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {validMarkers.map((item) => <CircleMarker center={[item.latitude, item.longitude]} radius={11} pathOptions={{ color: item.live ? '#1e6d48' : '#a36f3d', fillColor: item.live ? '#78c596' : '#e5b47d', fillOpacity: .95, weight: 3 }} key={item.id} />)}
        </MapContainer>
      </div>
      <div className="live-map-legend"><span><i className={`legend-dot ${marker.live ? 'live' : 'stale'}`} /> {marker.live ? 'Live position' : 'Last reported position'}</span><span>For directions, use Open in Google Maps.</span></div>
    </> : <div className="live-map-empty"><MapPinned size={24} /><b>No location available yet</b><span>{currentLocation ? 'Waiting for GPS permission.' : 'Ask the salesperson to start sharing location.'}</span></div>}
  </section>;
}
function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => { map.setView(center, 16, { animate: true }); }, [map, center]);
  return null;
}
function Login({ onLogin }) {
  const [mode, setMode] = useState('login'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true); setError(''); try { onLogin(await api(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: values })); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <div className="login-page"><div className="login-orb orb-one" /><div className="login-orb orb-two" /><section className="login-panel"><div className="login-intro"><Brand /><div><span className="kicker"><Sparkles size={15} /> Your field intelligence, in one place</span><h1>Make every<br /><i>meeting</i> matter.</h1><p>Sales Compass gives your team a calmer, smarter way to manage relationships, visits and revenue.</p></div><div className="intro-stat"><span>94%</span><p>of top performers plan their next move before the day starts.</p></div></div><form className="login-card" onSubmit={submit}><p className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'JOIN YOUR WORKSPACE'}</p><h2>{mode === 'login' ? 'Sign in to your workspace' : 'Create your sales account'}</h2><p className="muted">{mode === 'login' ? 'Use one of the demo accounts below, or your own credentials.' : 'Create a sales account to manage customers, follow-ups, and field visits.'}</p>{error && <p className="form-error">{error}</p>}{mode === 'register' && <><Field label="Full name"><input required name="name" placeholder="Your name" /></Field><Field label="Territory"><input name="territory" placeholder="Mumbai West" /></Field></>}<Field label="Work email"><input required type="email" name="email" defaultValue={mode === 'login' ? 'admin@salessphere.dev' : ''} placeholder="you@company.com" /></Field><Field label="Password"><input required type="password" name="password" defaultValue={mode === 'login' ? 'admin123' : ''} placeholder="At least 6 characters" /></Field>{mode === 'register' && <><Field label="Phone"><input name="phone" placeholder="+91" /></Field><Field label="Short bio"><textarea name="bio" placeholder="What do you sell and where do you work?" /></Field></>}<button className="primary full" disabled={busy}>{busy ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : mode === 'login' ? <>Open dashboard <ArrowUpRight size={18} /></> : <>Create account <ArrowUpRight size={18} /></>}</button>{mode === 'login' && <div className="demo-note"><b>Demo admin</b> admin@salessphere.dev &nbsp;·&nbsp; admin123<br /><b>Demo rep</b> arjun@salessphere.dev &nbsp;·&nbsp; sales123</div>}<button type="button" className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'New here? Create a sales account' : 'Already have an account? Sign in'}</button></form></section></div>;
}

function AdminDashboard({ overview, team, locations, customers, sales, onPage }) {
  const liveCount = locations.filter((pin) => pin.live).length;
  const reps = team.filter((member) => member.role === 'sales');
  const wonRevenue = sales.filter((sale) => sale.status === 'Closed Won').reduce((sum, sale) => sum + sale.amount, 0);
  return <section className="admin-console"><div className="admin-console-head"><div><p className="eyebrow">ADMINISTRATION · OPERATIONS CONTROL</p><h2>Know what is moving.</h2><p>Monitor your field team, customer book, and revenue from one command centre.</p></div><button className="admin-action" onClick={() => onPage('team')}><Users size={17} /> Open team monitor <ArrowUpRight size={16} /></button></div><section className="admin-stat-grid"><article><span><Users size={18} /></span><small>Sales team</small><b>{reps.length}</b><em>{liveCount} sharing live location</em></article><article><span><Building2 size={18} /></span><small>Customer book</small><b>{customers.length}</b><em>Accounts across territories</em></article><article><span><CircleDollarSign size={18} /></span><small>Won revenue</small><b>{money(wonRevenue)}</b><em>{sales.filter((sale) => sale.status === 'Closed Won').length} closed wins</em></article><article><span><MapPinned size={18} /></span><small>Location coverage</small><b>{reps.length ? `${Math.round((liveCount / reps.length) * 100)}%` : '0%'}</b><em>Consent-based live visibility</em></article></section><section className="admin-console-grid"><article className="admin-panel admin-team-preview"><div className="admin-panel-head"><div><p className="eyebrow">FIELD COVERAGE</p><h3>Team pulse</h3></div><button className="text-btn" onClick={() => onPage('team')}>View all <ChevronRight size={15} /></button></div>{reps.map((member) => { const pin = locations.find((item) => String(item.user._id) === String(member._id)); return <div className="admin-person" key={member._id}><Avatar name={member.name} /><div><b>{member.name}</b><small>{member.territory} · {pin?.live ? 'Sharing live location' : 'Awaiting location'}</small></div><Chip tone={pin?.live ? 'active' : 'stale'}>{pin?.live ? 'Live' : 'Offline'}</Chip></div>; })}</article><article className="admin-panel admin-priority"><div className="admin-panel-head"><div><p className="eyebrow">PORTFOLIO SNAPSHOT</p><h3>Priority accounts</h3></div><button className="text-btn" onClick={() => onPage('customers')}>Customer book <ChevronRight size={15} /></button></div>{customers.slice(0, 4).map((customer) => <div className="admin-customer" key={customer._id}><span className="company-symbol">{customer.company[0]}</span><div><b>{customer.company}</b><small>{customer.stage} · {customer.owner?.name || 'Unassigned'}</small></div><strong>{money(customer.value)}</strong></div>)}</article></section><section className="admin-console-footer"><span><ListChecks size={17} /> {overview?.metrics?.openFollowUps || 0} open follow-ups across the workspace</span><button className="outline-btn" onClick={() => onPage('sales')}>Review revenue ledger <ArrowUpRight size={15} /></button></section></section>;
}

function Dashboard({ overview, followUps, suggestions, onPage, onCreate, onComplete }) {
  const metrics = overview?.metrics || {}; const today = followUps.filter((item) => sameDay(item.dueDate) && item.status === 'Open');
  return <><section className="hero-card"><div><span className="kicker"><Flame size={15} /> FOCUS FOR TODAY</span><h2>{metrics.todayFollowUps || 0} conversation{metrics.todayFollowUps === 1 ? '' : 's'} can move the needle.</h2><p>Stay close to your most valuable opportunities. Your priority agenda is ready.</p><button className="cream-btn" onClick={() => onPage('followups')}>View today’s plan <ChevronRight size={17} /></button></div><div className="hero-visual"><div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="compass-face"><Target size={38} /><span>ON<br />COURSE</span></div><div className="hero-tag tag-one"><CalendarCheck2 size={16} /> {metrics.openFollowUps || 0} open</div><div className="hero-tag tag-two"><ArrowUpRight size={16} /> Momentum</div></div></section><section className="metric-grid"><Metric icon={Building2} label="Active customers" value={metrics.customerCount || 0} caption="Accounts in your book" tone="mint" /><Metric icon={ListChecks} label="Open follow-ups" value={metrics.openFollowUps || 0} caption={`${metrics.todayFollowUps || 0} due today`} tone="sand" /><Metric icon={CircleDollarSign} label="Won revenue" value={money(metrics.salesTotal)} caption={`${metrics.wonSales || 0} wins logged`} tone="lavender" /><Metric icon={Target} label="Follow-through" value={`${Math.min(100, Math.round(((metrics.wonSales || 0) / Math.max(1, metrics.customerCount || 1)) * 100))}%`} caption="Win ratio this cycle" tone="blue" /></section><section className="dashboard-columns"><section className="panel agenda"><div className="panel-head"><div><p className="eyebrow">YOUR AGENDA</p><h3>Next up</h3></div><button className="text-btn" onClick={() => onPage('followups')}>All follow-ups <ChevronRight size={16} /></button></div>{(overview?.dueItems || []).length ? overview.dueItems.slice(0, 4).map((item) => <FollowItem key={item._id} item={item} compact onComplete={onComplete} />) : <Empty label="Your agenda is clear." />}<button className="dashed-btn" onClick={() => onCreate('followup')}><Plus size={17} /> Schedule a follow-up</button></section><section className="panel insight"><div className="panel-head"><div><p className="eyebrow">SMART SIGNAL</p><h3>Best next move</h3></div><Sparkles className="sparkle" size={20} /></div>{suggestions?.nextActions?.[0] ? <><div className="insight-icon"><Target size={22} /></div><h4>{suggestions.nextActions[0].customer.company}</h4><p>{suggestions.nextActions[0].reason}</p><button className="dark-btn" onClick={() => onCreate('followup', { customer: suggestions.nextActions[0].customer._id })}>Plan the touchpoint <ArrowUpRight size={17} /></button></> : <Empty label="You are perfectly caught up." />}</section></section></>;
}
function Metric({ icon: Icon, label, value, caption, tone }) { return <article className={`metric-card ${tone}`}><span className="metric-icon"><Icon size={20} /></span><p>{label}</p><h3>{value}</h3><small>{caption}</small></article>; }
function FollowItem({ item, compact, onComplete }) { return <article className={`follow-item ${isOverdue(item) ? 'overdue' : ''}`}><div className="follow-time"><b>{sameDay(item.dueDate) ? new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(item.dueDate)) : day(item.dueDate)}</b><span>{item.type}</span></div><div className="follow-main"><b>{item.customer?.company || 'Customer'}</b><span>{item.visitLocation || item.notes || item.customer?.contactName}</span></div><Chip tone={item.priority.toLowerCase()}>{item.priority}</Chip>{item.status === 'Open' && <button className="complete-btn" title="Mark complete" onClick={() => onComplete(item)}><CalendarCheck2 size={17} /></button>}</article>; }
function FollowUps({ items, onComplete, onCreate }) { const [filter, setFilter] = useState('Open'); const visible = items.filter((item) => filter === 'All' || item.status === filter); return <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">ACTION CENTRE</p><h2>Follow-ups</h2><p className="muted">The promises that keep your pipeline moving.</p></div><button className="primary" onClick={onCreate}><Plus size={18} /> Add follow-up</button></div><div className="filter-bar">{['Open', 'Completed', 'All'].map((filterName) => <button className={filter === filterName ? 'selected' : ''} key={filterName} onClick={() => setFilter(filterName)}>{filterName}</button>)}</div><div className="follow-list">{visible.length ? visible.map((item) => <FollowItem key={item._id} item={item} onComplete={onComplete} />) : <Empty label="Nothing in this view yet." />}</div></section>; }
function Customers({ items, onCreate, onOpen }) { return <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">RELATIONSHIP BOOK</p><h2>Customers</h2><p className="muted">Every prospect, partner and customer in one view.</p></div><button className="primary" onClick={onCreate}><Plus size={18} /> New customer</button></div><div className="customer-grid">{items.length ? items.map((customer) => <article className="customer-card customer-clickable" key={customer._id} onClick={() => onOpen(customer)}><div className="customer-head"><span className="company-symbol">{customer.company.slice(0, 1)}</span><Chip tone={customer.stage.toLowerCase()}>{customer.stage}</Chip></div><h3>{customer.company}</h3><p>{customer.contactName} · {customer.city || 'No city added'}</p><div className="customer-details"><span>{customer.email || 'No email added'}</span><span>{customer.phone || 'No phone added'}</span><span>{customer.address || 'No address added'}</span>{customer.notes && <span className="customer-notes">{customer.notes}</span>}</div><div className="customer-footer"><span>{customer.industry || 'General'}</span><b>{money(customer.value)}</b></div><div className="owner-line">{customer.owner?.name && <><Avatar name={customer.owner.name} /> {customer.owner.name}</>}{customer.location?.coordinates?.length === 2 && <span><MapPinned size={13} /> Permanent location</span>}</div></article>) : <Empty label="No customer matches that search." />}</div></section>; }
function Sales({ items, onCreate, onEdit, onDelete }) { const total = items.filter((sale) => sale.status === 'Closed Won').reduce((sum, sale) => sum + sale.amount, 0); return <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">REVENUE HISTORY</p><h2>Sales ledger</h2><p className="muted">{money(total)} in recorded closed-won revenue.</p></div><button className="primary" onClick={onCreate}><Plus size={18} /> Log a sale</button></div><div className="sales-table"><div className="table-row table-label"><span>Customer</span><span>Product</span><span>Closed</span><span>Status</span><span>Value</span><span>Actions</span></div>{items.length ? items.map((sale) => <div className="table-row" key={sale._id}><span><b>{sale.customer?.company}</b><small>{sale.owner?.name}</small></span><span>{sale.product}</span><span>{day(sale.closedAt)}</span><span><Chip tone={sale.status === 'Closed Won' ? 'won' : 'lost'}>{sale.status}</Chip></span><span><b>{money(sale.amount)}</b></span><span className="row-actions"><button className="icon-btn" title="Edit sale" onClick={() => onEdit(sale)}><Pencil size={15} /></button><button className="icon-btn danger" title="Delete sale" onClick={() => onDelete(sale)}><Trash2 size={15} /></button></span></div>) : <Empty label="No sales have been recorded yet." />}</div></section>; }
function Navigator({ suggestions, locationState, sharingLocation, onLocate, onSchedule }) { return <section className="navigator-page"><div className="navigator-hero"><div><p className="eyebrow">LOCATION-INTELLIGENT SELLING</p><h2>Make the next stop<br /><i>the right one.</i></h2><p>{suggestions?.locationAvailable ? 'Your nearby opportunities are sorted by real distance from your latest shared location.' : 'Share your location to unlock nearby customer recommendations.'}</p><div className="location-actions"><button className="cream-btn" onClick={onLocate}><Crosshair size={17} /> {sharingLocation ? 'Sharing live' : 'Start sharing'}</button></div><small className="location-status"><span className="pulse-dot" /> {locationState}</small></div><div className="map-art"><span className="map-line line-one" /><span className="map-line line-two" /><span className="map-pin pin-one"><Building2 size={16} /></span><span className="map-pin pin-two"><Target size={16} /></span><span className="map-pin pin-three"><Sparkles size={15} /></span><div className="you-are-here">You are here</div></div></div><section className="suggestion-section"><div className="section-heading"><div><p className="eyebrow">CLOSE BY</p><h3>Customers worth a visit</h3></div><span className="subtle-label">Within 50 km</span></div><div className="nearby-grid">{suggestions?.nearby?.length ? suggestions.nearby.map((customer) => <article className="nearby-card" key={customer._id}><div><span className="company-symbol">{customer.company[0]}</span><Chip tone={customer.stage.toLowerCase()}>{customer.stage}</Chip></div><h3>{customer.company}</h3><p>{customer.city || 'Location saved'} · {customer.distanceKm} km away</p><b>{money(customer.value)} opportunity</b><button className="text-btn" onClick={() => onSchedule(customer)}>Schedule visit <ArrowUpRight size={16} /></button></article>) : <Empty label="No nearby accounts yet. Add customer coordinates and share your location." />}</div></section><section className="panel action-plan"><div className="panel-head"><div><p className="eyebrow">UNSCHEDULED OPPORTUNITIES</p><h3>Suggested daily follow-ups</h3></div><Sparkles className="sparkle" size={20} /></div>{suggestions?.nextActions?.length ? suggestions.nextActions.map(({ customer, reason }) => <article className="action-row" key={customer._id}><span className="action-number">{customer.company[0]}</span><div><b>{customer.company}</b><p>{reason}</p></div><button className="outline-btn" onClick={() => onSchedule(customer)}>Plan follow-up</button></article>) : <Empty label="All priority accounts already have a next action." />}</section></section>; }
function Team({ locations, team, onOpen, onToggle }) { const locationByUser = new Map(locations.map((pin) => [String(pin.user._id), pin])); const reps = team.filter((member) => member.role === 'sales'); const liveCount = reps.filter((member) => locationByUser.get(String(member._id))?.live).length; return <section className="panel full-panel"><div className="panel-head"><div><p className="eyebrow">ADMIN VIEW · LIVE WITH CONSENT</p><h2>Sales team</h2><p className="muted">Click an account for profile details. Use the location link to open the rep's current GPS position.</p></div><Chip tone="active">{liveCount} live · {reps.length} reps</Chip></div><div className="team-list">{reps.length ? reps.map((member) => { const pin = locationByUser.get(String(member._id)); const coordinates = pin?.location.location.coordinates; const liveLocationUrl = coordinates?.length === 2 ? `https://www.google.com/maps/search/?api=1&query=${coordinates[1]},${coordinates[0]}` : null; return <article className={`team-row team-profile team-clickable ${member.active === false ? 'inactive-row' : ''}`} key={member._id} onClick={() => onOpen(member)}><Avatar name={member.name} /><div className="team-profile-main"><b>{member.name}</b><p>{member.email} · {member.phone || 'No phone added'} · {member.territory}</p><small>{member.bio || 'No bio added yet.'}</small></div>{liveLocationUrl && <a className="coordinate live-location-link" href={liveLocationUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}><MapPinned size={14} /> Open live location</a>}<Chip tone={member.active === false ? 'stale' : pin?.live ? 'active' : pin ? 'stale' : ''}>{member.active === false ? 'Inactive' : pin?.live ? 'Live' : pin ? 'Stale' : 'No location'}</Chip><button className="icon-btn" title={member.active === false ? 'Reactivate salesperson' : 'Deactivate salesperson'} onClick={(event) => { event.stopPropagation(); onToggle(member); }}>{member.active === false ? <UserCheck size={16} /> : <UserX size={16} />}</button><button className="icon-btn danger" title="Permanently delete salesperson" onClick={(event) => { event.stopPropagation(); onToggle({ ...member, _permanent: true }); }}><Trash2 size={16} /></button></article>; }) : <Empty label="No sales reps have been added yet." />}</div></section>; }
function LocationHistory({ history, own = false }) {
  const visibleHistory = history.slice(0, 100);
  const groupedHistory = history.reduce((salespeople, entry) => {
    const userId = entry.user?._id || 'unknown';
    const salesperson = salespeople.find((group) => group.id === userId);
    if (salesperson) salesperson.entries.push(entry);
    else salespeople.push({ id: userId, name: entry.user?.name || 'Salesperson', entries: [entry] });
    return salespeople;
  }, []);
  return <section className="panel full-panel location-history"><div className="panel-head"><div><p className="eyebrow">{own ? 'MY MOVEMENT' : 'RETAINED MOVEMENT'}</p><h2>{own ? 'Your location history' : 'Location history'}</h2><p className="muted">Distances are straight-line GPS estimates between recorded points on the same day.</p></div><Chip tone="active">{visibleHistory.length} recent records</Chip></div>{visibleHistory.length ? <div className="history-list">{groupedHistory.map((group) => { let lastDay = ''; const distanceToday = group.entries.filter((entry) => sameDay(entry.recordedAt)).reduce((total, entry) => total + (entry.distanceFromPreviousKm || 0), 0); return <details className="history-person" key={group.id} open><summary className="history-person-head"><Avatar name={group.name} /><div><b>{group.name}</b><span>{group.entries.length} retained records · {distanceToday.toFixed(1)} km today</span></div><ChevronRight size={17} /></summary><div className="history-person-body">{group.entries.slice(0, 100).map((entry) => { const entryDay = day(entry.recordedAt); const showDay = entryDay !== lastDay; lastDay = entryDay; return <div className="history-entry" key={entry._id}>{showDay && <h4>{entryDay}</h4>}<div className="history-row"><MapPinned size={15} /><time dateTime={entry.recordedAt}>{new Date(entry.recordedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</time><span className="history-place" title={entry.placeName || 'Location name unavailable'}>{entry.placeName || 'Location name unavailable'}</span><b className="history-distance">{entry.distanceFromPreviousKm == null ? 'Start' : `${entry.distanceFromPreviousKm.toFixed(1)} km`}</b>{entry.accuracy ? <small>±{Math.round(entry.accuracy)}m</small> : <small>Accuracy unavailable</small>}</div></div>; })}</div></details>; })}</div> : <Empty label={own ? 'No location history yet. Start sharing your location to record your route.' : 'No retained location history yet.'} />}</section>;
}
function ProfileModal({ profile, canEdit, onClose, onSubmit }) { return <Modal title={`${profile.name}'s account`} onClose={onClose}><div className="detail-summary"><Avatar name={profile.name} /><div><b>{profile.name}</b><span>{profile.role === 'admin' ? 'Administrator' : 'Sales executive'} · {profile.email}</span></div><Chip tone={profile.role === 'admin' ? 'active' : ''}>{profile.role}</Chip></div>{canEdit ? <form className="form-grid" onSubmit={onSubmit}><Field label="Full name"><input required name="name" defaultValue={profile.name} /></Field><Field label="Territory"><input name="territory" defaultValue={profile.territory} /></Field><Field label="Phone"><input name="phone" defaultValue={profile.phone || ''} /></Field><Field label="Bio" wide><textarea name="bio" defaultValue={profile.bio || ''} /></Field><div className="form-actions wide"><button type="button" className="ghost-btn" onClick={onClose}>Cancel</button><button className="primary">Save account <ArrowUpRight size={17} /></button></div></form> : <div className="detail-readonly"><p>{profile.bio || 'No bio added yet.'}</p><span>{profile.phone || 'No phone added'} · {profile.territory}</span></div>}</Modal>; }
function CustomerDetail({ customer, canEdit, onClose, onEdit, onDelete }) { const coordinates = customer.location?.coordinates; return <Modal title={`${customer.company} account`} onClose={onClose}><div className="detail-grid"><div><span className="detail-label">CONTACT</span><b>{customer.contactName}</b><span>{customer.email || 'No email added'}</span><span>{customer.phone || 'No phone added'}</span></div><div><span className="detail-label">ACCOUNT</span><b>{customer.stage} · {customer.industry || 'General'}</b><span>{money(customer.value)} opportunity</span><span>Owner: {customer.owner?.name || 'Unassigned'}</span></div><div className="detail-wide"><span className="detail-label">PERMANENT BUSINESS LOCATION</span><b>{customer.address || customer.city || 'No address added'}</b>{coordinates?.length === 2 ? <a className="map-link" href={`https://www.google.com/maps/search/?api=1&query=${coordinates[1]},${coordinates[0]}`} target="_blank" rel="noreferrer"><MapPinned size={15} /> Open customer location in Maps</a> : <span>No customer coordinates saved.</span>}</div><div className="detail-wide"><span className="detail-label">NOTES</span><p>{customer.notes || 'No notes added.'}</p></div></div><div className="form-actions">{canEdit && <><button className="primary" onClick={onEdit}><Pencil size={16} /> Edit customer</button><button className="danger-btn" onClick={onDelete}><Trash2 size={16} /> Delete customer</button></>}</div></Modal>; }
function LocationCapture({ initialCoordinates = [] }) { const [coordinates, setCoordinates] = useState(initialCoordinates); const [status, setStatus] = useState(initialCoordinates.length === 2 ? 'Customer location saved' : 'Add the customer location from where you are'); function capture(event) { event.preventDefault(); if (!navigator.geolocation) return setStatus('Location is not supported by this browser'); setStatus('Finding your position...'); navigator.geolocation.getCurrentPosition(({ coords }) => { setCoordinates([coords.longitude, coords.latitude]); setStatus('Current location added'); }, () => setStatus('Location access is off'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }); } return <div className="location-capture wide"><input type="hidden" name="latitude" value={coordinates[1] || ''} readOnly /><input type="hidden" name="longitude" value={coordinates[0] || ''} readOnly /><button type="button" className="location-stop" onClick={capture}><Crosshair size={16} /> Add current location</button><small>{status}</small></div>; }
function CustomerEditForm({ customer, onClose, onSubmit }) { const coordinates = customer.location?.coordinates || []; return <Modal title={`Edit ${customer.company}`} onClose={onClose}><form className="form-grid" onSubmit={onSubmit}><Field label="Company name"><input required name="company" defaultValue={customer.company} /></Field><Field label="Contact name"><input required name="contactName" defaultValue={customer.contactName} /></Field><Field label="Email"><input type="email" name="email" defaultValue={customer.email || ''} /></Field><Field label="Phone"><input name="phone" defaultValue={customer.phone || ''} /></Field><Field label="City"><input name="city" defaultValue={customer.city || ''} /></Field><Field label="Industry"><input name="industry" defaultValue={customer.industry || ''} /></Field><Field label="Potential value"><input name="value" type="number" min="0" defaultValue={customer.value || 0} /></Field><Field label="Pipeline stage"><select name="stage"><option>Lead</option><option>Qualified</option><option>Proposal</option><option>Won</option><option>Lost</option></select></Field><Field label="Business address" wide><input name="address" defaultValue={customer.address || ''} placeholder="Street, area or landmark" /></Field><LocationCapture initialCoordinates={coordinates} /><Field label="Notes" wide><textarea name="notes" defaultValue={customer.notes || ''} /></Field><div className="form-actions wide"><button type="button" className="ghost-btn" onClick={onClose}>Cancel</button><button className="primary">Save customer <ArrowUpRight size={17} /></button></div></form></Modal>; }
function CustomerForm({ onClose, onSubmit }) { return <Modal title="Add a customer" onClose={onClose}><form className="form-grid" onSubmit={onSubmit}><Field label="Company name"><input required name="company" placeholder="e.g. Northstar Retail" /></Field><Field label="Contact name"><input required name="contactName" placeholder="Full name" /></Field><Field label="Email"><input type="email" name="email" placeholder="name@company.com" /></Field><Field label="Phone"><input name="phone" placeholder="+91" /></Field><Field label="City"><input name="city" placeholder="Mumbai" /></Field><Field label="Industry"><input name="industry" placeholder="Retail, SaaS..." /></Field><Field label="Potential value (INR)"><input name="value" type="number" min="0" defaultValue="0" /></Field><Field label="Pipeline stage"><select name="stage"><option>Lead</option><option>Qualified</option><option>Proposal</option><option>Won</option><option>Lost</option></select></Field><Field label="Business address" wide><input name="address" placeholder="Street, area or landmark" /></Field><LocationCapture /><Field label="Notes" wide><textarea name="notes" placeholder="Helpful context for the next conversation" /></Field><div className="form-actions wide"><button type="button" className="ghost-btn" onClick={onClose}>Cancel</button><button className="primary">Save customer <ArrowUpRight size={17} /></button></div></form></Modal>; }
function FollowUpForm({ onClose, onSubmit, customers, preset }) { const localValue = new Date(); localValue.setMinutes(localValue.getMinutes() - localValue.getTimezoneOffset()); return <Modal title="Plan a follow-up" onClose={onClose}><form className="form-grid" onSubmit={onSubmit}><Field label="Customer" wide><select required name="customer" defaultValue={preset?.customer || ''}><option value="" disabled>Select customer</option>{customers.filter((customer) => !['Won', 'Lost'].includes(customer.stage)).map((customer) => <option value={customer._id} key={customer._id}>{customer.company} — {customer.contactName}</option>)}</select></Field><Field label="When"><input required name="dueDate" type="datetime-local" defaultValue={localValue.toISOString().slice(0, 16)} /></Field><Field label="Follow-up type"><select name="type"><option>Call</option><option>Email</option><option>Visit</option><option>Demo</option><option>Proposal</option><option>Other</option></select></Field><Field label="Priority"><select name="priority"><option>Medium</option><option>High</option><option>Low</option></select></Field><Field label="Visit location" wide><input name="visitLocation" placeholder="Office, area or meeting point" /></Field><Field label="Notes" wide><textarea name="notes" placeholder="What needs to happen in this conversation?" /></Field><div className="form-actions wide"><button type="button" className="ghost-btn" onClick={onClose}>Cancel</button><button className="primary">Schedule follow-up <ArrowUpRight size={17} /></button></div></form></Modal>; }
function SaleForm({ onClose, onSubmit, customers, sale }) { return <Modal title={sale ? 'Edit sale' : 'Log a sale'} onClose={onClose}><form className="form-grid" onSubmit={onSubmit}><Field label="Customer" wide><select required name="customer" defaultValue={sale?.customer?._id || sale?.customer || ''}><option value="" disabled>Select customer</option>{customers.map((customer) => <option value={customer._id} key={customer._id}>{customer.company}</option>)}</select></Field><Field label="Product / plan"><input required name="product" defaultValue={sale?.product || ''} placeholder="Growth Suite" /></Field><Field label="Amount (INR)"><input required name="amount" type="number" min="0" defaultValue={sale?.amount || ''} placeholder="150000" /></Field><Field label="Closed on"><input name="closedAt" type="date" defaultValue={sale?.closedAt ? new Date(sale.closedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)} /></Field><Field label="Result"><select name="status" defaultValue={sale?.status || 'Closed Won'}><option>Closed Won</option><option>Closed Lost</option></select></Field><Field label="Notes" wide><textarea name="notes" defaultValue={sale?.notes || ''} placeholder="Optional closing notes" /></Field><div className="form-actions wide"><button type="button" className="ghost-btn" onClick={onClose}>Cancel</button><button className="primary">{sale ? 'Update sale' : 'Save to ledger'} <ArrowUpRight size={17} /></button></div></form></Modal>; }
function Empty({ label }) { return <div className="empty"><Compass size={23} /><span>{label}</span></div>; }
export default App;
