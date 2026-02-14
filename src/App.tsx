import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from '@/context/AppContext';
import { PromptPage } from '@/pages/PromptPage';
import { MapViewPage } from '@/pages/MapViewPage';
import { JobResponsePage } from '@/pages/JobResponsePage';
import { JobCalendarPage } from '@/pages/JobCalendarPage';

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PromptPage />} />
          <Route path="/map" element={<MapViewPage />} />
          <Route path="/response" element={<JobResponsePage />} />
          <Route path="/calendar" element={<JobCalendarPage />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
