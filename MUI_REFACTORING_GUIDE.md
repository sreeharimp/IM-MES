# MUI Implementation Guide - IM-MES Refactoring

## ✅ Completed Components

### 1. **Theme Configuration** (`src/theme.ts`)
- Modern, professional color palette
- Consistent typography hierarchy
- Component-level customizations
- Responsive breakpoints

### 2. **Navigation** (`src/components/Navbar.tsx`)
- MUI AppBar with professional header
- Responsive sidebar/drawer
- User profile menu
- Tab-based navigation system

### 3. **Machine Card** (`src/components/MachineCardMUI.tsx`)
- Professional card layout with MUI Card, CardContent, CardActions
- Status indicators with color-coded badges
- Progress visualization with LinearProgress
- Responsive grid layout for statistics
- Action buttons with proper MUI variants and colors

### 4. **Inspection Modal** (`src/components/InspectionModalMUI.tsx`)
- MUI Dialog with proper styling
- Form controls using MUI components
- Validation alerts and error handling
- Quality metrics visualization
- Responsive defect categorization list

---

## 🎯 Remaining Components to Refactor

### High Priority - User-Facing Components

#### 1. **AdminDashboard.tsx** - Key Improvements:
```tsx
// BEFORE: Custom CSS classes
<div className="admin-container">
  <div className="tab-bar">
    <button className="tab-btn active">Machines</button>
  </div>
</div>

// AFTER: MUI Components
import { Tabs, Tab, TabContext, TabPanel, Box } from '@mui/material';

<Box sx={{ width: '100%', typography: 'body1' }}>
  <TabContext value={activeTab}>
    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Tabs value={activeTab} onChange={handleTabChange}>
        <Tab label="Machines" value="machines" />
        <Tab label="Moulds" value="moulds" />
        <Tab label="Products" value="products" />
        {/* more tabs */}
      </Tabs>
    </Box>
    <TabPanel value="machines">{/* content */}</TabPanel>
  </TabContext>
</Box>
```

**Components to Use:**
- `Tabs`, `Tab`, `TabContext`, `TabPanel` for tab navigation
- `Table`, `TableHead`, `TableBody`, `TableRow`, `TableCell` for data tables
- `Dialog`, `DialogTitle`, `DialogContent`, `DialogActions` for edit modals
- `Button` variants: contained, outlined, text
- `TextField` for inputs
- `Select` for dropdowns

#### 2. **BreakdownModal.tsx** - Key Improvements:
```tsx
// Use MUI Dialog with proper form structure
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Button } from '@mui/material';

// Add form validation
const [errors, setErrors] = useState<Record<string, string>>({});

// Use MUI Alert for error messages
<Alert severity="error">{error}</Alert>
```

#### 3. **JobSetupModal.tsx** - Key Improvements:
```tsx
// Use MUI Stepper for multi-step form
import { Stepper, Step, StepLabel, Button, Box } from '@mui/material';

// Create form sections with clear layouts
<FormControl fullWidth variant="outlined">
  <InputLabel>Mould</InputLabel>
  <Select value={mould} label="Mould">
    <MenuItem>Select Mould</MenuItem>
  </Select>
</FormControl>
```

#### 4. **HandoverSummaryModal.tsx & ShiftHandoverPage.tsx** - Key Improvements:
```tsx
// Use MUI Grid for layout
import { Grid, Paper, Card, CardContent, CardActions } from '@mui/material';

// Use MUI List for handover items
import { List, ListItem, ListItemText, ListItemIcon, Checkbox } from '@mui/material';
```

---

## 📋 Component Refactoring Checklist

### Layout Components
- [ ] **AdminDashboard.tsx** - Replace custom CSS with MUI Tabs, Tables, Dialogs
- [ ] **ShiftHandoverPage.tsx** - Use MUI Grid, Card, List components
- [ ] **BatchLogPage.tsx** - Use MUI DataGrid or Table with pagination
- [ ] **ShiftLogPage.tsx** - Use MUI Timeline and Table components
- [ ] **BreakdownLogPage.tsx** - Use MUI Table with filters
- [ ] **InspectionPage.tsx** - Use MUI Grid and Card layouts

### Modal Components
- [ ] **BreakdownModal.tsx** - Replace with MUI Dialog
- [ ] **JobSetupModal.tsx** - Use MUI Stepper for multi-step form
- [ ] **HandoverSummaryModal.tsx** - Use MUI Dialog with Card layout
- [ ] **ResolveBreakdownModal.tsx** - Replace with MUI Dialog
- [ ] **ForceOperatorAssignmentModal.tsx** - Use MUI Dialog + Select
- [ ] **BinCompleteModal.tsx** - Use MUI Dialog with form

### Page Components
- [ ] **AboutPage.tsx** - Use MUI Typography and Box components
- [ ] **Login.tsx** - Already using MUI (verify and enhance)

---

## 🎨 Color & Typography Guidelines

### Status Colors
```tsx
const statusColors: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  'Running': 'success',      // #16a34a (Green)
  'Idle': 'info',            // #0284c7 (Blue)
  'Maintenance': 'warning',  // #f59e0b (Amber)
  'Completed': 'success',    // #16a34a (Green)
  'Failed': 'error',         // #dc2626 (Red)
};
```

### Typography Hierarchy
- **h1**: Page titles, main headings
- **h4**: Section titles, dialog titles
- **h6**: Component headings
- **body1**: Regular text
- **body2**: Secondary text, helper text
- **caption**: Labels, metadata, timestamps

### Spacing Consistency
```tsx
// MUI spacing scale (multiplied by 8px)
gap: 1,   // 8px
gap: 1.5, // 12px
gap: 2,   // 16px
gap: 3,   // 24px
gap: 4,   // 32px

// Padding/Margin
p: 2,     // 16px
m: 1,     // 8px
```

---

## 📱 Responsive Design Pattern

```tsx
import { useTheme, useMediaQuery } from '@mui/material';

const MyComponent = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isTablet = useMediaQuery(theme.breakpoints.down('lg'));

  return (
    <Grid container spacing={isMobile ? 1 : 2}>
      <Grid item xs={12} sm={6} md={4}>
        Content that stacks on mobile, 2 cols on tablet, 3 cols on desktop
      </Grid>
    </Grid>
  );
};
```

---

## 🔄 Form Validation Pattern

```tsx
import { TextField, Alert, FormHelperText } from '@mui/material';

const [errors, setErrors] = useState<Record<string, string>>({});

const handleValidation = () => {
  const newErrors: Record<string, string> = {};
  if (!binTarget) newErrors.binTarget = 'Bin target is required';
  if (binTarget <= 0) newErrors.binTarget = 'Must be greater than 0';
  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};

<TextField
  label="Bin Target"
  type="number"
  value={binTarget}
  onChange={(e) => setBinTarget(Number(e.target.value))}
  error={Boolean(errors.binTarget)}
  helperText={errors.binTarget}
/>
```

---

## 🎯 Best Practices

### 1. **Imports Organization**
```tsx
// MUI core components
import { Box, Container, Typography, Button } from '@mui/material';

// MUI icons
import { Close as CloseIcon, Add as AddIcon } from '@mui/icons-material';

// Local imports
import MyComponent from './MyComponent';
```

### 2. **SX Prop vs Styled Components**
```tsx
// Use SX for quick, component-specific styling
<Box sx={{ 
  display: 'flex', 
  gap: 2, 
  bgcolor: 'primary.main',
  p: 2 
}} />

// Use styled components for reusable, complex styles
const StyledContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(2),
  padding: theme.spacing(2),
}));
```

### 3. **Consistency Across Components**
- Use theme colors: `primary.main`, `success.main`, `error.main`, etc.
- Use theme spacing: `spacing(1)`, `spacing(2)`, etc.
- Use theme typography: `typography: 'body2'`
- Maintain consistent button sizes and styles

### 4. **Accessibility**
```tsx
// Always include ARIA labels for icon buttons
<IconButton aria-label="close" onClick={onClose}>
  <CloseIcon />
</IconButton>

// Use proper semantic HTML
<FormControl fullWidth>
  <InputLabel id="select-label">Label</InputLabel>
  <Select labelId="select-label" id="select">
    <MenuItem value="">Select...</MenuItem>
  </Select>
</FormControl>
```

---

## 🚀 Implementation Steps

1. **Update each component file** to use MUI components
2. **Replace custom CSS classes** with sx prop or theme customizations
3. **Use MUI icons** instead of lucide-react where possible
4. **Test responsive behavior** on mobile, tablet, desktop
5. **Verify accessibility** with keyboard navigation and screen readers
6. **Remove custom CSS** from index.css as components are refactored

---

## 📦 Integration Steps

1. Start with priority page components (Dashboard, Admin Pages)
2. Continue with modal components
3. Refactor logging/history pages
4. Update remaining utility components
5. Remove legacy CSS classes after all components are updated

---

## ✨ Benefits of MUI Implementation

- **Consistency**: Unified design language across the entire application
- **Accessibility**: Built-in WCAG compliance
- **Responsiveness**: Mobile-first approach with breakpoints
- **Customization**: Theme system for easy updates
- **Productivity**: Ready-to-use components reduce development time
- **Maintenance**: Cleaner code, easier to update and maintain
- **Performance**: Optimized component implementations
