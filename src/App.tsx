import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from '@/context/AppContext';
import { PromptPage } from '@/pages/PromptPage';
import { AgentMatchingPage } from '@/pages/AgentMatchingPage';
import { JobResponsePage } from '@/pages/JobResponsePage';
import { JobCalendarPage } from '@/pages/JobCalendarPage';
import { FulfillmentPage } from '@/pages/FulfillmentPage';
import { VendorDashboard } from '@/pages/VendorDashboard';
import { NewVendorPage } from '@/pages/NewVendorPage';
import { EditVendorPage } from '@/pages/EditVendorPage';
import { NewCustomerPage } from '@/pages/NewCustomerPage';
import { VendorCalendarPage } from '@/pages/VendorCalendarPage';

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          {/* Home = prompt (question text box); vendor mode top right */}
          <Route path="/" element={<PromptPage />} />

          {/* Customer flow */}
          <Route path="/customer/agents" element={<AgentMatchingPage />} />
          <Route path="/customer/results" element={<JobResponsePage />} />
          <Route path="/customer/calendar" element={<JobCalendarPage />} />
          <Route path="/customer/tracking" element={<FulfillmentPage />} />
          <Route path="/customer/new" element={<NewCustomerPage />} />

          {/* Vendor flow */}
          <Route path="/vendor" element={<VendorDashboard />} />
          <Route path="/vendor/new" element={<NewVendorPage />} />
          <Route path="/vendor/edit" element={<EditVendorPage />} />
          <Route path="/vendor/calendar" element={<VendorCalendarPage />} />
          <Route path="/vendor/tracking" element={<FulfillmentPage />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
