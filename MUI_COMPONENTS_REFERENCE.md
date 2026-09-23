# MUI Components - Usage Quick Reference

## 🎯 Component Overview & Import Guide

### Created Components

#### 1. **Navbar** - Navigation Component
**File**: `src/components/Navbar.tsx`
**Use**: Top-level navigation with sidebar

```tsx
import Navbar from './components/Navbar';

<Navbar 
  activeTab="Shop Floor"
  onTabChange={handleTabChange}
  onLogout={handleLogout}
  profile={userProfile}
  isCollapsed={sidebarCollapsed}
  onCollapsedChange={setSidebarCollapsed}
/>
```

**Features**:
- Responsive header and sidebar
- Mobile drawer support
- User profile menu
- Tab switching
- Logout functionality

---

#### 2. **MachineCardMUI** - Machine Status Card
**File**: `src/components/MachineCardMUI.tsx`
**Use**: Display individual machine status on shop floor

```tsx
import MachineCardMUI from './components/MachineCardMUI';

<MachineCardMUI
  machine={machine}
  products={products}
  operators={operators}
  moulds={moulds}
  batchRecords={batchRecords}
  onAction={(id, action) => handleAction(id, action)}
  onComplete={(id) => handleComplete(id)}
  onAssign={() => handleAssign()}
  onResolve={() => handleResolve()}
/>
```

**Features**:
- Real-time status indicators
- Progress visualization
- Production metrics
- Action buttons
- Responsive grid layout

---

#### 3. **InspectionModalMUI** - Quality Inspection
**File**: `src/components/InspectionModalMUI.tsx`
**Use**: Record inspection results and quality metrics

```tsx
import InspectionModalMUI from './components/InspectionModalMUI';

<InspectionModalMUI
  binId="BIN-001"
  netQty={1000}
  defectTypes={defectTypes}
  operators={operators}
  onClose={handleClose}
  onConfirm={(data) => handleConfirm(data)}
/>
```

**Features**:
- Defect categorization
- Quality rate calculation
- Inspector assignment
- Validation with error display
- Dialog modal interface

---

#### 4. **BreakdownModalMUI** - Maintenance Logging
**File**: `src/components/BreakdownModalMUI.tsx`
**Use**: Log machine breakdowns with root cause analysis

```tsx
import BreakdownModalMUI from './components/BreakdownModalMUI';

<BreakdownModalMUI
  machineId="MC-01"
  machineName="Machine 1"
  breakdownReasons={reasons}
  onClose={handleClose}
  onConfirm={(data) => handleConfirm(data)}
/>
```

**Features**:
- Breakdown reason dropdown
- Remarks textarea with validation
- Error handling
- Dialog modal interface

---

#### 5. **DashboardOverviewMUI** - Dashboard Metrics
**File**: `src/components/DashboardOverviewMUI.tsx`
**Use**: Display KPIs and production metrics

```tsx
import DashboardOverviewMUI from './components/DashboardOverviewMUI';

<DashboardOverviewMUI
  metrics={metrics}
  machineStats={{
    total: 10,
    running: 7,
    idle: 2,
    maintenance: 1
  }}
  recentActivity={activities}
/>
```

**Features**:
- KPI cards with trends
- Machine status breakdown
- Production summaries
- Activity table
- Responsive card layout

---

## 🛠️ Common MUI Components Reference

### Layout
```tsx
import { Box, Container, Grid, Stack, Paper } from '@mui/material';

// Box - Generic container
<Box sx={{ display: 'flex', gap: 2, p: 2 }}>
  {content}
</Box>

// Grid - Responsive layout
<Grid container spacing={2}>
  <Grid item xs={12} sm={6} md={4}>
    {item}
  </Grid>
</Grid>

// Stack - Flex container with consistent spacing
<Stack spacing={2}>
  {items}
</Stack>

// Container - Constrained width
<Container maxWidth="lg">
  {content}
</Container>
```

### Forms
```tsx
import { 
  TextField, FormControl, InputLabel, Select, MenuItem,
  FormHelperText, FormLabel, RadioGroup, Radio, Checkbox
} from '@mui/material';

// Text Input
<TextField
  label="Name"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  error={Boolean(error)}
  helperText={error}
  fullWidth
/>

// Dropdown Select
<FormControl fullWidth>
  <InputLabel>Option</InputLabel>
  <Select value={value} label="Option">
    <MenuItem value="1">Option 1</MenuItem>
  </Select>
</FormControl>

// Radio Group
<FormControl>
  <FormLabel>Choose One</FormLabel>
  <RadioGroup value={value} onChange={(e) => setValue(e.target.value)}>
    <FormControlLabel value="1" control={<Radio />} label="Option 1" />
  </RadioGroup>
</FormControl>

// Checkbox
<FormControlLabel
  control={<Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} />}
  label="Agree"
/>
```

### Buttons
```tsx
import { Button, IconButton, ButtonGroup } from '@mui/material';

// Primary Button
<Button variant="contained" color="primary">
  Submit
</Button>

// Secondary Button
<Button variant="outlined">
  Cancel
</Button>

// Text Button
<Button variant="text" color="primary">
  Link
</Button>

// Icon Button
<IconButton onClick={handleClick}>
  <CloseIcon />
</IconButton>

// Button Group
<ButtonGroup>
  <Button>One</Button>
  <Button>Two</Button>
</ButtonGroup>
```

### Dialogs & Alerts
```tsx
import { Dialog, DialogTitle, DialogContent, DialogActions, Alert } from '@mui/material';

// Dialog
<Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
  <DialogTitle>Title</DialogTitle>
  <DialogContent dividers>
    {content}
  </DialogContent>
  <DialogActions>
    {actions}
  </DialogActions>
</Dialog>

// Alert
<Alert severity="success">Success message</Alert>
<Alert severity="error">Error message</Alert>
<Alert severity="warning">Warning message</Alert>
```

### Data Display
```tsx
import { 
  Table, TableHead, TableBody, TableRow, TableCell,
  Chip, Avatar, AvatarGroup
} from '@mui/material';

// Table
<TableContainer>
  <Table>
    <TableHead>
      <TableRow>
        <TableCell>Column 1</TableCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {rows.map(row => (
        <TableRow key={row.id}>
          <TableCell>{row.col1}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</TableContainer>

// Chip - Compact element
<Chip label="Status" color="success" />

// Avatar
<Avatar>JD</Avatar>
```

### Cards
```tsx
import { Card, CardHeader, CardContent, CardActions } from '@mui/material';

<Card>
  <CardHeader title="Title" subheader="Subtitle" />
  <CardContent>
    {content}
  </CardContent>
  <CardActions>
    {actions}
  </CardActions>
</Card>
```

### Progress & Status
```tsx
import { LinearProgress, CircularProgress, Stepper, Step, StepLabel } from '@mui/material';

// Linear Progress
<LinearProgress variant="determinate" value={75} />

// Circular Progress
<CircularProgress />

// Stepper
<Stepper activeStep={activeStep}>
  <Step>
    <StepLabel>Step 1</StepLabel>
  </Step>
</Stepper>
```

### Typography
```tsx
import { Typography } from '@mui/material';

<Typography variant="h4">Heading</Typography>
<Typography variant="body1">Body text</Typography>
<Typography variant="caption">Small text</Typography>
```

---

## 🎨 Styling with SX Prop

### Common SX Props

```tsx
// Layout
sx={{
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 2,
}}

// Spacing
sx={{
  p: 2,        // padding: 16px
  m: 1,        // margin: 8px
  mb: 3,       // margin-bottom: 24px
  px: 2, py: 1 // padding-x: 16px, padding-y: 8px
}}

// Colors
sx={{
  color: 'primary.main',
  bgcolor: 'success.light',
  borderColor: 'error.main'
}}

// Typography
sx={{
  fontWeight: 700,
  fontSize: '1.25rem',
  letterSpacing: -0.5,
  textTransform: 'uppercase'
}}

// Border & Shadow
sx={{
  border: '1px solid #e0e0e0',
  borderRadius: 2,
  boxShadow: 1
}}

// Responsive
sx={{
  display: { xs: 'none', sm: 'block' }, // Hide on mobile, show on tablet+
  fontSize: { xs: '0.875rem', sm: '1rem' },
  p: { xs: 1, sm: 2, md: 3 }
}}

// Hover & Active
sx={{
  '&:hover': { bgcolor: 'action.hover' },
  '&:active': { bgcolor: 'action.selected' }
}}
```

---

## 🎯 Migration Checklist Template

When converting a component:

```tsx
// 1. Replace imports
- Remove: import { Icon } from 'lucide-react'
+ Add: import { Icon as IconIcon } from '@mui/icons-material'
- Remove: import './Component.css'
+ Add: import { Box, Button, ... } from '@mui/material'

// 2. Replace JSX structure
- Remove: <div className="custom-class">
+ Add: <Box sx={{ /* styles */ }}>

// 3. Replace styling
- Remove: className="btn btn-primary"
+ Add: <Button variant="contained" color="primary">

// 4. Replace form elements
- Remove: <input className="fi" />
+ Add: <TextField fullWidth />

// 5. Replace modals
- Remove: <div className="ov modal">
+ Add: <Dialog open={open}>

// 6. Test
- [ ] Component renders
- [ ] All props work
- [ ] Responsive layout
- [ ] Keyboard navigation
- [ ] No console errors
```

---

## 📚 Files Structure

```
src/
├── theme.ts                          # Main theme configuration
├── components/
│   ├── Navbar.tsx                    # Navigation bar (NEW)
│   ├── MachineCardMUI.tsx           # Machine card (NEW)
│   ├── InspectionModalMUI.tsx       # Inspection modal (NEW)
│   ├── BreakdownModalMUI.tsx        # Breakdown modal (NEW)
│   ├── DashboardOverviewMUI.tsx     # Dashboard (NEW)
│   ├── Login.tsx                     # Login (existing, uses MUI)
│   ├── AdminDashboard.tsx            # Admin panel (needs refactor)
│   ├── JobSetupModal.tsx             # Job setup (needs refactor)
│   ├── ShiftHandoverPage.tsx         # Handover (needs refactor)
│   └── ... (other existing components)
├── App.tsx                           # Main app (updated)
├── main.tsx                          # Entry point (updated)
└── index.css                         # Minimal CSS (remove custom classes)
```

---

## 🔗 Integration Tips

### Using Multiple Components Together

```tsx
import { Box, Grid } from '@mui/material';
import Navbar from './components/Navbar';
import MachineCardMUI from './components/MachineCardMUI';

export default function App() {
  return (
    <>
      <Navbar 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLogout={handleLogout}
        profile={profile}
      />
      <Box sx={{ mt: 8, p: 2 }}>
        {/* Add top margin for fixed navbar */}
        <Grid container spacing={2}>
          {machines.map(machine => (
            <Grid item xs={12} sm={6} md={4} key={machine.id}>
              <MachineCardMUI {...machineProps} />
            </Grid>
          ))}
        </Grid>
      </Box>
    </>
  );
}
```

---

## ⚡ Performance Tips

1. **Memoize Components**: Use `React.memo()` for frequently re-rendered components
2. **Lazy Load**: Use `React.lazy()` for page components
3. **Avoid Inline Functions**: Define handlers outside JSX
4. **Use useCallback**: Memoize event handlers
5. **Virtualize Lists**: For large tables, use react-window or MUI's virtualized components

---

## 🎓 Next Steps

1. Review the existing components in your codebase
2. Pick one component to refactor as a pilot
3. Follow the migration checklist template
4. Test thoroughly on mobile/tablet/desktop
5. Get feedback on the new design
6. Scale to remaining components following the priority list
