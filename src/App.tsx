import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from '@/context/AppContext';
import { PromptPage } from '@/pages/PromptPage';
import { AgentMatchingPage } from '@/pages/AgentMatchingPage';
import { JobResponsePage } from '@/pages/JobResponsePage';
import { JobCalendarPage } from '@/pages/JobCalendarPage';
import { FulfillmentPage } from '@/pages/FulfillmentPage';
import { VendorDashboard } from '@/pages/VendorDashboard';
import { NewServicePage } from '@/pages/NewServicePage';
import { NewVendorPage } from '@/pages/NewVendorPage';
import { NewConsumerPage } from '@/pages/NewConsumerPage';
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
          <Route path="/customer/new" element={<NewConsumerPage />} />

          {/* Vendor flow */}
          <Route path="/vendor" element={<VendorDashboard />} />
          <Route path="/vendor/new" element={<NewVendorPage />} />
          <Route path="/vendor/new-service" element={<NewServicePage />} />
          <Route path="/vendor/calendar" element={<VendorCalendarPage />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
