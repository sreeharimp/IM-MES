import React, { useState, useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline, Box, Container } from '@mui/material';
import theme from './theme';
import { AppHeader } from './components/layout/AppHeader';
import { PlanList } from './components/plans/PlanList';
import { PrintQueue } from './components/queue/PrintQueue';
import { PaperManagement } from './components/admin/PaperManagement';
import { ProductPackSetup } from './components/admin/ProductPackSetup';
import { AuditTrailView } from './components/admin/AuditTrailView';
import { Product, Machine } from './types';
import { supabase } from './lib/supabase';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<number>(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);

  const fetchMasterData = async () => {
    try {
      // Fetch Products
      const { data: prodData } = await supabase
        .from('products')
        .select('*')
        .order('name');
      setProducts(prodData || []);

      // Fetch Machines
      const { data: macData } = await supabase
        .from('machines')
        .select('*')
        .order('name');
      setMachines(macData || []);
    } catch (err) {
      console.error('Failed to fetch master data:', err);
    }
  };

  useEffect(() => {
    fetchMasterData();
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
        <AppHeader currentTab={currentTab} onTabChange={setCurrentTab} />

        <Container maxWidth="xl" sx={{ py: 3.5 }}>
          {currentTab === 0 && (
            <PlanList
              products={products}
              machines={machines}
              onNavigateToQueue={() => setCurrentTab(1)}
            />
          )}
          {currentTab === 1 && <PrintQueue />}
          {currentTab === 2 && <PaperManagement />}
          {currentTab === 3 && (
            <ProductPackSetup
              products={products}
              onRefreshProducts={fetchMasterData}
            />
          )}
          {currentTab === 4 && <AuditTrailView />}
        </Container>
      </Box>
    </ThemeProvider>
  );
};

export default App;
