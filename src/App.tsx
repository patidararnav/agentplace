import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from '@/context/AppContext';
import { LandingPage } from '@/pages/LandingPage';
import { PromptPage } from '@/pages/PromptPage';
import { AgentMatchingPage } from '@/pages/AgentMatchingPage';
import { MapViewPage } from '@/pages/MapViewPage';
import { JobResponsePage } from '@/pages/JobResponsePage';
import { JobCalendarPage } from '@/pages/JobCalendarPage';
import { VendorDashboard } from '@/pages/VendorDashboard';
import { NewServicePage } from '@/pages/NewServicePage';
import { VendorCalendarPage } from '@/pages/VendorCalendarPage';

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          {/* Landing */}
          <Route path="/" element={<LandingPage />} />

          {/* Customer flow */}
          <Route path="/customer" element={<PromptPage />} />
          <Route path="/customer/agents" element={<AgentMatchingPage />} />
          <Route path="/customer/map" element={<MapViewPage />} />
          <Route path="/customer/results" element={<JobResponsePage />} />
          <Route path="/customer/calendar" element={<JobCalendarPage />} />

          {/* Vendor flow */}
          <Route path="/vendor" element={<VendorDashboard />} />
          <Route path="/vendor/new-service" element={<NewServicePage />} />
          <Route path="/vendor/calendar" element={<VendorCalendarPage />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
