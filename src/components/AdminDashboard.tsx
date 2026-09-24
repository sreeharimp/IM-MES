import React, { useState } from 'react';
import { Plus, Trash2, Users, Box, Layers, Database, Cpu, RefreshCcw, Edit2, X, ShieldCheck, Clock, AlertTriangle, Wrench, Calendar, Lock, UserCheck, LogOut, UserX, ShieldAlert } from 'lucide-react';
import type { Machine, Operator, Mould, Product, RawMaterial, ProductMaterial, ShiftSetting, DefectType, BreakdownReason, CleaningTask } from '../types';
import { supabase } from '../lib/supabase';
import { logSystemChange } from '../utils/systemChanges';
import { ProductionPlannerModule } from './planner/ProductionPlannerModule';

interface AdminDashboardProps {
  machines: Machine[];
  operators: Operator[];
  moulds: Mould[];
  products: Product[];
  rawMaterials: RawMaterial[];
  productMaterials: ProductMaterial[];
  supervisors: { email: string, full_name: string, employee_code?: string }[];
  shiftSettings: ShiftSetting[];
  defectTypes: DefectType[];
  breakdownReasons: BreakdownReason[];
  cleaningTasks: CleaningTask[];
  currentUserRole: string;
  currentUserName?: string;
  currentUserId?: string;
}

const ShiftRow = ({ s, updateShiftTiming }: { s: ShiftSetting, updateShiftTiming: (id: string, start: string, end: string) => void }) => {
  const [start, setStart] = useState(s.startTime);
  const [end, setEnd] = useState(s.endTime);
  
  // Reset if s changes remotely
  React.useEffect(() => {
    setStart(s.startTime);
    setEnd(s.endTime);
  }, [s.startTime, s.endTime]);

  const hasChanged = start !== s.startTime || end !== s.endTime;

  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{s.name}</td>
      <td>
        <input type="time" className="fi" style={{ maxWidth: '120px' }} value={start || ''} onChange={e => setStart(e.target.value)} />
      </td>
      <td>
        <input type="time" className="fi" style={{ maxWidth: '120px' }} value={end || ''} onChange={e => setEnd(e.target.value)} />
      </td>
      <td>
        <button 
          className={`btn bsm ${hasChanged ? 'bpri' : 'bsec'}`} 
          disabled={!hasChanged}
          onClick={() => updateShiftTiming(s.id, start, end)}
        >
          {hasChanged ? 'Save Changes' : 'Saved'}
        </button>
      </td>
    </tr>
  );
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  machines, operators, moulds, products, rawMaterials, productMaterials, supervisors, shiftSettings, defectTypes, breakdownReasons, cleaningTasks, currentUserRole,
  currentUserName = 'Admin', currentUserId
}) => {
  const [activeTab, setActiveTab] = useState<'machines' | 'moulds' | 'products' | 'materials' | 'operators' | 'shifts' | 'users' | 'defects' | 'breakdowns' | 'checklist' | 'planning'>('machines');
  const [profiles, setProfiles] = useState<{ id: string, email: string, full_name: string, role: string, employee_code?: string, is_active?: boolean, last_seen_at?: string | null, revoked_reason?: string | null }[]>([]);
  const [newSupervisor, setNewSupervisor] = useState({ email: '', fullName: '', employeeCode: '' });
  const [newOperator, setNewOperator] = useState({ name: '', employeeId: '' });
  const [newMould, setNewMould] = useState({ id: '', name: '', cavities: 4, cycleTime: 20 });
  const [newProduct, setNewProduct] = useState({ name: '', mouldId: '', itemCode: '', batchIdentifier: '', binQty: 4000, stdPackSize: 1000 });
  const [newMaterial, setNewMaterial] = useState({ id: '', name: '', vendor: '' });
  const [newMachine, setNewMachine] = useState({ id: '', name: '', model: '' });
  const [newDefect, setNewDefect] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newTask, setNewTask] = useState('');

  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editingOperator, setEditingOperator] = useState<string | null>(null);
  const [editingMould, setEditingMould] = useState<string | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<string | null>(null);
  const [editingSupervisor, setEditingSupervisor] = useState<string | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingMachine, setEditingMachine] = useState<string | null>(null);
  const [editingDefectId, setEditingDefectId] = useState<string | null>(null);
  const [editingDefectName, setEditingDefectName] = useState('');
  const [editingReasonId, setEditingReasonId] = useState<string | null>(null);
  const [editingReasonName, setEditingReasonName] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskLabel, setEditingTaskLabel] = useState('');

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const DEFAULT_USER_TYPES = ['Admin', 'PowerUser', 'Supervisor', 'QC', 'Planner', 'Stores', 'Operator'];

  const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
    Admin: ['Live Dashboard', 'Shop Floor', 'Planning & Labels', 'Inspections', 'Packing', 'Batch Log', 'Shift Log', 'Breakdowns', 'Machines', 'About'],
    PowerUser: ['Live Dashboard', 'Shop Floor', 'Planning & Labels', 'Inspections', 'Packing', 'Batch Log', 'Shift Log', 'Breakdowns', 'Machines', 'About'],
    Supervisor: ['Live Dashboard', 'Shop Floor', 'Planning & Labels', 'Inspections', 'Packing', 'Batch Log', 'Shift Log', 'Breakdowns', 'Machines', 'About'],
    QC: ['Inspections', 'Packing', 'Batch Log', 'Shift Log', 'About'],
    Planner: ['Planning & Labels', 'Batch Log', 'Shift Log', 'About'],
    Stores: ['Planning & Labels', 'Packing', 'About'],
    Operator: ['Shop Floor', 'About'],
  };

  const [userTypes, setUserTypes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('mes_user_types');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse cached user types', e);
    }
    return DEFAULT_USER_TYPES;
  });

  const [newUserType, setNewUserType] = useState('');

  const handleAddUserType = () => {
    const trimmed = newUserType.trim();
    if (!trimmed) return;
    if (userTypes.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      showError(`User type "${trimmed}" already exists.`);
      return;
    }
    const updated = [...userTypes, trimmed];
    setUserTypes(updated);
    setRolePermissions(prev => ({
      ...prev,
      [trimmed]: prev[trimmed] || ['Shop Floor', 'About'],
    }));
    localStorage.setItem('mes_user_types', JSON.stringify(updated));
    setNewUserType('');
    showSuccess(`User type "${trimmed}" added! Configure permissions and click "Save Access Levels".`);
  };

  const handleDeleteUserType = (roleToDelete: string) => {
    if (!confirm(`Are you sure you want to delete user type "${roleToDelete}"?`)) return;
    const updated = userTypes.filter(t => t !== roleToDelete);
    setUserTypes(updated);
    setRolePermissions(prev => {
      const copy = { ...prev };
      delete copy[roleToDelete];
      return copy;
    });
    localStorage.setItem('mes_user_types', JSON.stringify(updated));
    showSuccess(`User type "${roleToDelete}" deleted.`);
  };

  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem('mes_role_permissions');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse cached role permissions', e);
    }
    return DEFAULT_ROLE_PERMISSIONS;
  });

  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  const togglePermission = (role: string, moduleId: string) => {
    setRolePermissions(prev => {
      const current = prev[role] || [];
      const updated = current.includes(moduleId)
        ? current.filter(m => m !== moduleId)
        : [...current, moduleId];
      return { ...prev, [role]: updated };
    });
  };

  const saveAccessLevels = async () => {
    setIsSavingPermissions(true);
    try {
      localStorage.setItem('mes_role_permissions', JSON.stringify(rolePermissions));
      localStorage.setItem('mes_user_types', JSON.stringify(userTypes));
      window.dispatchEvent(new CustomEvent('mes_permissions_updated', { detail: { rolePermissions, userTypes } }));

      const { error } = await supabase.from('app_settings').upsert({
        id: 'global',
        role_permissions: rolePermissions,
      });

      if (error) {
        console.warn('Persist to app_settings DB warning (column or RLS):', error.message);
      }

      logSystemChange({
        module: 'User Access',
        tableName: 'app_settings',
        recordId: 'global',
        fieldChanged: 'role_permissions',
        newValue: JSON.stringify(rolePermissions),
        action: 'UPDATE',
        reason: 'Saved RBAC User Types & Module Access Levels',
        changedByName: currentUserName,
        changedByRole: currentUserRole,
        changedById: currentUserId,
      });

      showSuccess('Access levels saved successfully.');
    } catch (err: any) {
      showError(`Failed to save access levels: ${err.message}`);
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 3000);
  };

  React.useEffect(() => {
    const fetchProfiles = async () => {
      const { data } = await supabase.from('profiles').select('*').order('full_name');
      if (data) setProfiles(data.map(p => ({ 
        id: p.id, 
        email: p.email, 
        full_name: p.full_name, 
        role: p.role, 
        employee_code: p.employee_code,
        is_active: p.is_active,
        last_seen_at: p.last_seen_at,
        revoked_reason: p.revoked_reason
      })));
    };
    fetchProfiles();

    const fetchRolePermissions = async () => {
      try {
        const { data } = await supabase.from('app_settings').select('role_permissions').eq('id', 'global').maybeSingle();
        if (data?.role_permissions) {
          setRolePermissions(data.role_permissions);
          localStorage.setItem('mes_role_permissions', JSON.stringify(data.role_permissions));
        }
      } catch (err) {
        console.warn('Could not fetch role_permissions from app_settings', err);
      }
    };
    fetchRolePermissions();
    
    // Subscribe to profile changes
    const sub = supabase.channel('profiles_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchProfiles)
      .subscribe();
      
    return () => { supabase.removeChannel(sub); };
  }, []);

  const updateShiftTiming = async (id: string, startTime: string, endTime: string) => {
    if (!startTime || !endTime) return;
    const existing = shiftSettings.find(s => s.id === id);
    const { error } = await supabase.from('shift_settings').update({ start_time: startTime, end_time: endTime }).eq('id', id);
    if (error) {
      showError(`Error updating shift: ${error.message}`);
    } else {
      showSuccess(`Shift ${id} updated to ${startTime} - ${endTime}`);
      logSystemChange({
        module: 'Shift Config',
        tableName: 'shift_settings',
        recordId: id,
        fieldChanged: 'timing',
        oldValue: existing ? `${existing.startTime} - ${existing.endTime}` : null,
        newValue: `${startTime} - ${endTime}`,
        action: 'UPDATE',
        reason: `Updated shift ${id} operating hours`,
        changedByName: currentUserName,
        changedByRole: currentUserRole,
        changedById: currentUserId,
      });
    }
  };

  const saveOperator = async () => {
    if (!newOperator.name || !newOperator.employeeId) {
      showError('Operator Name and Employee ID are required.');
      return;
    }
    
    let error;
    if (editingOperator) {
      const { error: err } = await supabase.from('operators').update({
        name: newOperator.name,
        employee_id: newOperator.employeeId
      }).eq('id', editingOperator);
      error = err;
    } else {
      const { error: err } = await supabase.from('operators').insert({
        id: `O${Date.now()}`,
        name: newOperator.name,
        employee_id: newOperator.employeeId,
        is_certified: true
      });
      error = err;
    }

    if (error) {
      console.error('Error saving operator:', error);
      alert(`Failed to save operator: ${error.message}`);
      return;
    }

    showSuccess(`Operator ${newOperator.name} ${editingOperator ? 'updated' : 'added'}!`);
    setNewOperator({ name: '', employeeId: '' });
    setEditingOperator(null);
  };

  const saveSupervisor = async () => {
    if (!newSupervisor.email || !newSupervisor.fullName) {
      showError('Email and Full Name are required.');
      return;
    }

    if (editingProfileId) {
      const { error } = await supabase.from('profiles').update({
        full_name: newSupervisor.fullName,
        employee_code: newSupervisor.employeeCode
      }).eq('id', editingProfileId);
      if (error) { showError(error.message); return; }
    } else {
      const { error } = await supabase.from('authorized_supervisors').upsert({
        email: newSupervisor.email.toLowerCase(),
        full_name: newSupervisor.fullName,
        employee_code: newSupervisor.employeeCode
      });
      if (error) { showError(error.message); return; }
      
      // If profile already exists for this email, update it too
      await supabase.from('profiles').update({ 
        full_name: newSupervisor.fullName,
        employee_code: newSupervisor.employeeCode 
      }).eq('email', newSupervisor.email.toLowerCase());
    }

    showSuccess(`User ${newSupervisor.fullName} ${editingSupervisor || editingProfileId ? 'updated' : 'authorized'}.`);
    setNewSupervisor({ email: '', fullName: '', employeeCode: '' });
    setEditingSupervisor(null);
    setEditingProfileId(null);
  };

  const cancelEdit = () => {
    setNewSupervisor({ email: '', fullName: '', employeeCode: '' });
    setEditingSupervisor(null);
    setEditingProfileId(null);
    setEditingProduct(null);
    setEditingOperator(null);
    setEditingMould(null);
    setEditingMaterial(null);
    setEditingMachine(null);
    setNewProduct({ name: '', mouldId: '', itemCode: '', batchIdentifier: '', binQty: 4000, stdPackSize: 1000 });
    setNewOperator({ name: '', employeeId: '' });
    setNewMould({ id: '', name: '', cavities: 4, cycleTime: 20 });
    setNewMaterial({ id: '', name: '', vendor: '' });
    setNewMachine({ id: '', name: '', model: '' });
  };

  const editProfile = (p: any) => {
    setNewSupervisor({ email: p.email, fullName: p.full_name || '', employeeCode: p.employee_code || '' });
    setEditingProfileId(p.id);
    setEditingSupervisor(null);
  };



  const removeSupervisor = async (email: string) => {
    if (!confirm(`Revoke access for ${email}?`)) return;
    const { error } = await supabase.from('authorized_supervisors').delete().eq('email', email);
    if (error) showError(error.message);
    else showSuccess('Supervisor access revoked.');
  };

  const saveMould = async () => {
    if (!newMould.id || !newMould.name) {
      showError('Mould ID and Name are required.');
      return;
    }
    
    let error;
    if (editingMould) {
      const { error: err } = await supabase.from('moulds').update({
        name: newMould.name,
        cavities: newMould.cavities,
        cycle_time: newMould.cycleTime
      }).eq('id', editingMould);
      error = err;
    } else {
      const { error: err } = await supabase.from('moulds').insert({
        id: newMould.id,
        name: newMould.name,
        cavities: newMould.cavities,
        cycle_time: newMould.cycleTime
      });
      error = err;
    }

    if (error) {
      showError(`Failed to save mould: ${error.message}`);
    } else {
      showSuccess(`Mould ${newMould.id} saved.`);
      setNewMould({ id: '', name: '', cavities: 4, cycleTime: 20 });
      setEditingMould(null);
    }
  };

  const saveProduct = async () => {
    if (!newProduct.name || !newProduct.mouldId || !newProduct.itemCode) {
      showError('Product Name, Mould selection, and Item Code are required.');
      return;
    }

    const productData = {
      name: newProduct.name,
      mould_id: newProduct.mouldId,
      item_code: newProduct.itemCode,
      batch_identifier: newProduct.batchIdentifier,
      bin_qty: newProduct.binQty,
      std_pack_size: newProduct.stdPackSize
    };

    let error;
    const isUpdate = !!editingProduct;
    const oldProduct = isUpdate ? products.find(p => p.id === editingProduct) : null;
    const targetId = editingProduct || `P${Date.now()}`;

    if (editingProduct) {
      const { error: updateError } = await supabase
        .from('products')
        .update(productData)
        .eq('id', editingProduct);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('products')
        .insert({
          ...productData,
          id: targetId
        });
      error = insertError;
    }

    if (error) {
      console.error('Error saving product:', error);
      alert(`Failed to save product: ${error.message}`);
      return;
    }

    showSuccess(`Product ${newProduct.name} ${editingProduct ? 'updated' : 'added'}.`);
    logSystemChange({
      module: 'Products',
      tableName: 'products',
      recordId: targetId,
      fieldChanged: isUpdate ? 'product_spec' : 'all',
      oldValue: oldProduct ? { bin_qty: oldProduct.binQty, std_pack_size: oldProduct.stdPackSize, batch_id: oldProduct.batchIdentifier } : null,
      newValue: { bin_qty: newProduct.binQty, std_pack_size: newProduct.stdPackSize, batch_id: newProduct.batchIdentifier },
      action: isUpdate ? 'UPDATE' : 'CREATE',
      reason: `${isUpdate ? 'Updated' : 'Created'} product ${newProduct.name}`,
      changedByName: currentUserName,
      changedByRole: currentUserRole,
      changedById: currentUserId,
    });
    setNewProduct({ name: '', mouldId: '', itemCode: '', batchIdentifier: '', binQty: 4000, stdPackSize: 1000 });
    setEditingProduct(null);
  };

  const startEditProduct = (p: Product) => {
    setEditingProduct(p.id);
    setNewProduct({
      name: p.name,
      mouldId: p.mouldId,
      itemCode: p.itemCode,
      batchIdentifier: p.batchIdentifier || '',
      binQty: p.binQty,
      stdPackSize: p.stdPackSize
    });
  };

  const saveMachine = async () => {
    if (!newMachine.id || !newMachine.name) {
      alert('Machine ID and Name are required.');
      return;
    }
    let error;
    if (editingMachine) {
      const { error: err } = await supabase.from('machines').update({
        name: newMachine.name,
        model: newMachine.model
      }).eq('id', editingMachine);
      error = err;
    } else {
      const { error: err } = await supabase.from('machines').insert({
        id: newMachine.id,
        name: newMachine.name,
        model: newMachine.model,
        status: 'Idle'
      });
      error = err;
    }
    if (error) alert(`Error: ${error.message}`);
    else {
      showSuccess(`Machine ${newMachine.id} saved.`);
      setNewMachine({ id: '', name: '', model: '' });
      setEditingMachine(null);
    }
  };

  const saveMaterial = async () => {
    if (!newMaterial.id || !newMaterial.name) {
      alert('Material Code and Name are required.');
      return;
    }
    let error;
    if (editingMaterial) {
      const { error: err } = await supabase.from('raw_materials').update({
        name: newMaterial.name,
        vendor: newMaterial.vendor
      }).eq('id', editingMaterial);
      error = err;
    } else {
      const { error: err } = await supabase.from('raw_materials').insert(newMaterial);
      error = err;
    }
    if (error) alert(`Error: ${error.message}`);
    else {
      showSuccess(`Material ${newMaterial.name} saved.`);
      setNewMaterial({ id: '', name: '', vendor: '' });
      setEditingMaterial(null);
    }
  };

  const linkMaterial = async (productId: string, materialId: string) => {
    const { error } = await supabase.from('approved_materials').insert({ product_id: productId, material_id: materialId });
    if (error) { console.error(error); alert('Failed to link material'); return; }
    showSuccess('Material approval linked.');
  };

  const deleteMould = async (id: string) => {
    const { error } = await supabase.from('moulds').delete().eq('id', id);
    if (error) { 
      console.error('Error deleting mould:', error); 
      alert(`Cannot delete mould: ${error.message}`); 
    }
  };

  const deleteProduct = async (id: string) => {
    const existing = products.find(p => p.id === id);
    const { error = null } = await supabase.from('products').delete().eq('id', id);
    if (error) { 
      console.error('Error deleting product:', error); 
      alert(`Cannot delete product: ${error.message}`); 
    } else {
      logSystemChange({
        module: 'Products',
        tableName: 'products',
        recordId: id,
        oldValue: existing?.name,
        action: 'DELETE',
        reason: `Deleted product ${existing?.name || id}`,
        changedByName: currentUserName,
        changedByRole: currentUserRole,
        changedById: currentUserId,
      });
    }
  };

  const deleteMaterial = async (id: string) => {
    const { error } = await supabase.from('raw_materials').delete().eq('id', id);
    if (error) { 
      console.error('Error deleting material:', error); 
      alert(`Cannot delete material: ${error.message}`); 
    }
  };

  const deleteOperator = async (id: string) => {
    const { error } = await supabase.from('operators').delete().eq('id', id);
    if (error) {
      console.error('Error deleting operator:', error);
      alert(`Failed to delete operator: ${error.message}`);
    }
  };

  const refreshSchema = async () => {
    // Force a full application state refresh
    window.location.reload();
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    const targetUser = profiles.find(p => p.id === userId);
    const oldRole = targetUser?.role;
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (error) {
      alert(`Error updating role: ${error.message}`);
    } else {
      showSuccess(`User role updated to ${newRole}`);
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, role: newRole } : p));
      logSystemChange({
        module: 'User Access',
        tableName: 'profiles',
        recordId: userId,
        fieldChanged: 'role',
        oldValue: oldRole,
        newValue: newRole,
        action: 'UPDATE',
        reason: `Role changed from ${oldRole} to ${newRole} for ${targetUser?.full_name || userId}`,
        changedByName: currentUserName,
        changedByRole: currentUserRole,
        changedById: currentUserId,
      });
    }
  };

  const isUserOnline = (p: { is_active?: boolean, last_seen_at?: string | null }) => {
    if (p.is_active === false) return false;
    if (!p.last_seen_at) return false;
    const diffMs = Date.now() - new Date(p.last_seen_at).getTime();
    return diffMs >= 0 && diffMs < 120000; // Active within last 2 minutes
  };

  const formatLastSeen = (p: { is_active?: boolean, last_seen_at?: string | null }) => {
    if (p.is_active === false) return 'Revoked';
    if (!p.last_seen_at) return 'Never';
    const diffSec = Math.floor((Date.now() - new Date(p.last_seen_at).getTime()) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return new Date(p.last_seen_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const forceLogoutUser = async (user: { id: string, full_name: string, email: string }) => {
    if (user.id === currentUserId) {
      showError("You cannot force logout your own active session.");
      return;
    }
    if (!window.confirm(`Force logout ${user.full_name || user.email}? Their active session will be terminated immediately.`)) {
      return;
    }
    const { error } = await supabase.from('profiles').update({
      revoked_reason: 'FORCE_LOGOUT',
      last_seen_at: null,
      updated_at: new Date().toISOString()
    }).eq('id', user.id);

    if (error) {
      showError(`Failed to logout user: ${error.message}`);
    } else {
      showSuccess(`Logged out ${user.full_name || user.email}`);
      logSystemChange({
        module: 'Access Control',
        tableName: 'profiles',
        recordId: user.id,
        fieldChanged: 'session',
        oldValue: 'Active',
        newValue: 'Logged Out',
        action: 'UPDATE',
        reason: `Admin forced logout for ${user.full_name}`,
        changedByName: currentUserName,
        changedByRole: currentUserRole,
        changedById: currentUserId,
      });
      setProfiles(prev => prev.map(p => p.id === user.id ? { ...p, last_seen_at: null, revoked_reason: 'FORCE_LOGOUT' } : p));
    }
  };

  const toggleRevokeAccess = async (user: { id: string, full_name: string, email: string, is_active?: boolean }) => {
    if (user.id === currentUserId) {
      showError("You cannot revoke your own account access.");
      return;
    }
    const willRevoke = user.is_active !== false;
    const confirmMsg = willRevoke 
      ? `Are you sure you want to REVOKE access for ${user.full_name || user.email}? They will be immediately disconnected and prevented from logging in.`
      : `Restore account access for ${user.full_name || user.email}?`;
    
    if (!window.confirm(confirmMsg)) return;

    const updates = willRevoke
      ? { is_active: false, revoked_reason: `Revoked by ${currentUserName || 'Admin'} at ${new Date().toLocaleString()}`, last_seen_at: null, updated_at: new Date().toISOString() }
      : { is_active: true, revoked_reason: null, updated_at: new Date().toISOString() };

    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
    if (error) {
      showError(`Failed to update access: ${error.message}`);
    } else {
      showSuccess(willRevoke ? `Access revoked for ${user.full_name}` : `Access restored for ${user.full_name}`);
      logSystemChange({
        module: 'Access Control',
        tableName: 'profiles',
        recordId: user.id,
        fieldChanged: 'is_active',
        oldValue: willRevoke ? 'true' : 'false',
        newValue: willRevoke ? 'false' : 'true',
        action: 'UPDATE',
        reason: willRevoke ? `Revoked access for ${user.full_name}` : `Restored access for ${user.full_name}`,
        changedByName: currentUserName,
        changedByRole: currentUserRole,
        changedById: currentUserId,
      });
      setProfiles(prev => prev.map(p => p.id === user.id ? { ...p, ...updates } : p));
    }
  };

  const TabButton = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
    <button 
      onClick={() => setActiveTab(id)}
      className={`btn ${activeTab === id ? 'bpri' : 'bsec'}`}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '13px' }}
    >
      <Icon size={14} /> {label}
    </button>
  );

  return (
    <div className="animate-fade-in">
      {successMsg && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 1000,
          background: 'var(--green-bg)', color: 'var(--green)', 
          padding: '12px 20px', borderRadius: '8px', border: '1px solid var(--green-dim)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)', animation: 'slide-in 0.3s ease-out'
        }}>
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 1000,
          background: 'var(--red-bg)', color: 'var(--red)', 
          padding: '12px 20px', borderRadius: '8px', border: '1px solid var(--red-dim)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)', animation: 'slide-in 0.3s ease-out'
        }}>
          {errorMsg}
        </div>
      )}

      {/* Internal Sub-Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <TabButton id="machines" label="Machines" icon={Cpu} />
          <TabButton id="moulds" label="Moulds" icon={Box} />
          <TabButton id="products" label="Products" icon={Layers} />
          <TabButton id="planning" label="Production Planning" icon={Calendar} />
          <TabButton id="materials" label="Materials" icon={Database} />
          <TabButton id="operators" label="Operators" icon={Users} />
          {['Admin', 'PowerUser', 'Supervisor'].includes(currentUserRole) && (
            <TabButton id="users" label="Access Management" icon={ShieldCheck} />
          )}
          <TabButton id="shifts" label="Shift Setup" icon={Clock} />
          <TabButton id="defects" label="Defects" icon={AlertTriangle} />
          <TabButton id="breakdowns" label="Breakdown Reasons" icon={Wrench} />
          <TabButton id="checklist" label="Startup Checklist" icon={ShieldCheck} />
        </div>
        <button className="btn bsm" onClick={refreshSchema} title="Force Schema Refresh">
          <RefreshCcw size={14} />
        </button>
      </div>

      {activeTab === 'machines' && (
        <div className="card animate-scale-in">
          <div className="ch">
            <span className="ct2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={14} /> Machine Registry
            </span>
          </div>
          <div className="cb">
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1.5fr 1.5fr auto auto', gap: '8px', marginBottom: '16px' }}>
              <input className="fi" placeholder="ID (M1)" disabled={!!editingMachine} value={newMachine.id} onChange={e => setNewMachine({ ...newMachine, id: e.target.value })} />
              <input className="fi" placeholder="Machine Name" value={newMachine.name} onChange={e => setNewMachine({ ...newMachine, name: e.target.value })} />
              <input className="fi" placeholder="Model" value={newMachine.model} onChange={e => setNewMachine({ ...newMachine, model: e.target.value })} />
              <button className={`btn ${editingMachine ? 'bwrn' : 'bpri'}`} onClick={saveMachine}>
                {editingMachine ? <RefreshCcw size={16} /> : <Plus size={16} />}
              </button>
              {editingMachine && <button className="btn bsec" onClick={cancelEdit}><X size={16} /></button>}
            </div>
            <table className="dt">
              <thead>
                <tr><th>ID</th><th>Name</th><th>Model</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {machines.map(m => (
                  <tr key={m.id}>
                    <td className="mono" style={{ color: 'var(--text2)' }}>{m.id}</td>
                    <td style={{ fontWeight: 500 }}>{m.name}</td>
                    <td style={{ color: 'var(--text3)' }}>{m.model}</td>
                    <td>
                      <span className={`pill ${m.status === 'Running' ? 'pg' : m.status === 'Maintenance' ? 'pr' : 'pd'}`}>
                        {m.status}
                      </span>
                    </td>
                    <td>
                      <button className="btn bsm" style={{ color: 'var(--blue)' }} onClick={() => { setEditingMachine(m.id); setNewMachine({ id: m.id, name: m.name, model: m.model || '' }); }}><Edit2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'moulds' && (
        <div className="card animate-scale-in">
          <div className="ch">
            <span className="ct2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Box size={14} /> Mould Registry
            </span>
          </div>
          <div className="cb">
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 80px auto auto', gap: '8px', marginBottom: '16px' }}>
              <input className="fi" placeholder="ID (M-XXXX)" disabled={!!editingMould} value={newMould.id} onChange={e => setNewMould({ ...newMould, id: e.target.value })} />
              <input className="fi" placeholder="Mould Name" value={newMould.name} onChange={e => setNewMould({ ...newMould, name: e.target.value })} />
              <input type="number" className="fi" placeholder="Cav." value={newMould.cavities || ''} onChange={e => setNewMould({ ...newMould, cavities: Number(e.target.value) })} />
              <input type="number" className="fi" placeholder="Cycle" value={newMould.cycleTime || ''} onChange={e => setNewMould({ ...newMould, cycleTime: Number(e.target.value) })} />
              <button className={`btn ${editingMould ? 'bwrn' : 'bpri'}`} onClick={saveMould}>
                {editingMould ? <RefreshCcw size={16} /> : <Plus size={16} />}
              </button>
              {editingMould && <button className="btn bsec" onClick={cancelEdit}><X size={16} /></button>}
            </div>
            <table className="dt">
              <thead>
                <tr><th>ID</th><th>Name</th><th>Cavities</th><th>Cycle Time</th><th></th></tr>
              </thead>
              <tbody>
                {moulds.map(m => (
                  <tr key={m.id}>
                    <td className="mono">{m.id}</td>
                    <td>{m.name}</td>
                    <td className="mono">{m.cavities}</td>
                    <td className="mono">{m.cycleTime}s</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn bsm" style={{ color: 'var(--blue)' }} onClick={() => { setEditingMould(m.id); setNewMould({ id: m.id, name: m.name, cavities: m.cavities, cycleTime: m.cycleTime }); }}><Edit2 size={12} /></button>
                        <button className="btn bsm" style={{ color: 'var(--red)' }} onClick={() => deleteMould(m.id)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'products' && (
        <div className="card animate-scale-in">
          <div className="ch">
            <span className="ct2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={14} /> Product Registry
            </span>
          </div>
          <div className="cb">
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 80px 80px 80px auto', gap: '8px', marginBottom: '16px' }}>
              <input className="fi" placeholder="Product Name" value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} />
              <select className="fi" value={newProduct.mouldId} onChange={e => setNewProduct({ ...newProduct, mouldId: e.target.value })}>
                <option value="">Select Mould...</option>
                {moulds.map(m => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
              </select>
              <input className="fi" placeholder="Item Code" value={newProduct.itemCode} onChange={e => setNewProduct({ ...newProduct, itemCode: e.target.value })} />
              <input className="fi" placeholder="Batch ID" title="Batch Identifier (e.g. BT)" value={newProduct.batchIdentifier} onChange={e => setNewProduct({ ...newProduct, batchIdentifier: e.target.value })} />
              <input type="number" className="fi" placeholder="Bin" value={newProduct.binQty || ''} onChange={e => setNewProduct({ ...newProduct, binQty: Number(e.target.value) })} />
              <input type="number" className="fi" placeholder="Pack" value={newProduct.stdPackSize || ''} onChange={e => setNewProduct({ ...newProduct, stdPackSize: Number(e.target.value) })} />
              <button className={`btn ${editingProduct ? 'bwrn' : 'bpri'}`} onClick={saveProduct}>
                {editingProduct ? <RefreshCcw size={16} /> : <Plus size={16} />}
              </button>
              {editingProduct && (
                <button className="btn bsec" onClick={cancelEdit}>
                  <X size={16} />
                </button>
              )}
            </div>
            <table className="dt">
              <thead>
                <tr><th>Name</th><th>Mould</th><th>Item Code</th><th>Batch ID</th><th>Bin Qty</th><th>Std Pack</th><th>Approved RM</th><th></th></tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td className="mono" style={{ fontSize: '11px' }}>{p.mouldId}</td>
                    <td className="mono" style={{ fontSize: '11px' }}>{p.itemCode}</td>
                    <td className="mono" style={{ fontWeight: 600, color: 'var(--purple)' }}>{p.batchIdentifier}</td>
                    <td className="mono">{p.binQty}</td>
                    <td className="mono">{p.stdPackSize}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {productMaterials.filter(pm => pm.productId === p.id).map(pm => {
                          const mat = rawMaterials.find(rm => rm.id === pm.materialId);
                          return (
                            <span key={pm.materialId} className="tag tb" style={{ fontSize: '9px', display: 'flex', gap: '4px' }}>
                              <span style={{ opacity: 0.7 }}>{pm.materialId}</span>
                              <span>{mat?.name || 'Unknown'}</span>
                            </span>
                          );
                        })}
                        <select 
                          className="fi" 
                          style={{ height: '22px', padding: '0 4px', fontSize: '10px', width: '80px' }}
                          onChange={(e) => {
                            if (e.target.value) linkMaterial(p.id, e.target.value);
                            e.target.value = "";
                          }}
                        >
                          <option value="">+ Approve</option>
                          {rawMaterials.filter(rm => !productMaterials.some(pm => pm.productId === p.id && pm.materialId === rm.id)).map(rm => (
                            <option key={rm.id} value={rm.id}>{rm.name}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn bsm" style={{ color: 'var(--blue)' }} onClick={() => startEditProduct(p)}><Edit2 size={12} /></button>
                        <button className="btn bsm" style={{ color: 'var(--red)' }} onClick={() => deleteProduct(p.id)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'materials' && (
        <div className="card animate-scale-in">
          <div className="ch">
            <span className="ct2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={14} /> Raw Material Registry
            </span>
          </div>
          <div className="cb">
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr auto auto', gap: '8px', marginBottom: '16px' }}>
              <input className="fi" placeholder="RM Code" disabled={!!editingMaterial} value={newMaterial.id} onChange={e => setNewMaterial({ ...newMaterial, id: e.target.value })} />
              <input className="fi" placeholder="Material Name" value={newMaterial.name} onChange={e => setNewMaterial({ ...newMaterial, name: e.target.value })} />
              <input className="fi" placeholder="Vendor" value={newMaterial.vendor} onChange={e => setNewMaterial({ ...newMaterial, vendor: e.target.value })} />
              <button className={`btn ${editingMaterial ? 'bwrn' : 'bpri'}`} onClick={saveMaterial}>
                {editingMaterial ? <RefreshCcw size={16} /> : <Plus size={16} />}
              </button>
              {editingMaterial && <button className="btn bsec" onClick={cancelEdit}><X size={16} /></button>}
            </div>
            <table className="dt">
              <thead>
                <tr><th>Code</th><th>Name</th><th>Vendor</th><th></th></tr>
              </thead>
              <tbody>
                {rawMaterials.map(rm => (
                  <tr key={rm.id}>
                    <td className="mono">{rm.id}</td>
                    <td>{rm.name}</td>
                    <td>{rm.vendor}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn bsm" style={{ color: 'var(--blue)' }} onClick={() => { setEditingMaterial(rm.id); setNewMaterial({ id: rm.id, name: rm.name, vendor: rm.vendor }); }}><Edit2 size={12} /></button>
                        <button className="btn bsm" style={{ color: 'var(--red)' }} onClick={() => deleteMaterial(rm.id)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'operators' && (
        <div className="card animate-scale-in">
          <div className="ch">
            <span className="ct2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={14} /> Operator Registry
            </span>
          </div>
          <div className="cb">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '8px', marginBottom: '16px' }}>
              <input className="fi" placeholder="Operator Name" value={newOperator.name} onChange={e => setNewOperator({ ...newOperator, name: e.target.value })} />
              <input className="fi" placeholder="Employee ID" value={newOperator.employeeId} onChange={e => setNewOperator({ ...newOperator, employeeId: e.target.value })} />
              <button className={`btn ${editingOperator ? 'bwrn' : 'bpri'}`} onClick={saveOperator}>
                {editingOperator ? <RefreshCcw size={16} /> : <Plus size={16} />}
              </button>
              {editingOperator && <button className="btn bsec" onClick={cancelEdit}><X size={16} /></button>}
            </div>

            <table className="dt">
              <thead>
                <tr><th>Employee ID</th><th>Name</th><th>Certification</th><th></th></tr>
              </thead>
              <tbody>
                {operators.map(o => (
                  <tr key={o.id}>
                    <td className="mono" style={{ color: 'var(--text2)' }}>{o.employeeId}</td>
                    <td style={{ fontWeight: 500 }}>{o.name}</td>
                    <td><span className="pill pg">Certified</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn bsm" style={{ color: 'var(--blue)' }} onClick={() => { setEditingOperator(o.id); setNewOperator({ name: o.name, employeeId: o.employeeId }); }}><Edit2 size={12} /></button>
                        <button className="btn bsm" style={{ background: 'var(--red-bg)', color: 'var(--red)', borderColor: 'var(--red-dim)' }} onClick={() => deleteOperator(o.id)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="animate-fade-in">
          {/* Quick Invite Form */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="ch">
              <span className="ct2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Plus size={14} /> {editingProfileId ? 'Edit Profile' : (editingSupervisor ? 'Edit Whitelist Entry' : 'Authorize New User')}
              </span>
            </div>
            <div className="cb">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto auto', gap: '8px' }}>
                <input className="fi" placeholder="Email Address" disabled={!!editingSupervisor || !!editingProfileId} title={editingProfileId ? "Email cannot be changed" : ""} value={newSupervisor.email} onChange={e => setNewSupervisor({ ...newSupervisor, email: e.target.value })} />
                <input className="fi" placeholder="Full Name" value={newSupervisor.fullName} onChange={e => setNewSupervisor({ ...newSupervisor, fullName: e.target.value })} />
                <input className="fi" placeholder="Employee Code" value={newSupervisor.employeeCode} onChange={e => setNewSupervisor({ ...newSupervisor, employeeCode: e.target.value })} />
                <button className={`btn ${(editingSupervisor || editingProfileId) ? 'bwrn' : 'bpri'}`} onClick={saveSupervisor}>
                  {(editingSupervisor || editingProfileId) ? <RefreshCcw size={16} /> : <Plus size={16} />} 
                  <span style={{ marginLeft: '6px' }}>{(editingSupervisor || editingProfileId) ? 'Update' : 'Authorize User'}</span>
                </button>
                {(editingSupervisor || editingProfileId) && <button className="btn bsec" onClick={cancelEdit}><X size={16} /></button>}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="ch">
              <span className="ct2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={14} /> Registered Accounts & Whitelist
              </span>
            </div>
            <div className="cb">
              <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                 <div style={{ flex: 1 }}>
                   <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>Active User Profiles</div>
                   <table className="dt">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Last Active</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profiles.map(p => {
                        const online = isUserOnline(p);
                        const isRevoked = p.is_active === false;
                        return (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 600 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {isRevoked ? (
                                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} title="Access Revoked" />
                                ) : online ? (
                                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)', display: 'inline-block' }} title="Online / Logged In" />
                                ) : (
                                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text3)', opacity: 0.4, display: 'inline-block' }} title="Offline" />
                                )}
                                <span>{p.full_name || 'No Name'}</span>
                                {p.employee_code && <span style={{ fontSize: '10px', color: 'var(--text3)' }}>({p.employee_code})</span>}
                              </div>
                            </td>
                            <td className="mono" style={{ color: 'var(--text2)', fontSize: '11px' }}>{p.email}</td>
                            <td>
                              <span className={`pill ${p.role === 'Admin' ? 'pg' : p.role === 'PowerUser' ? 'pp' : 'pd'}`}>
                                {p.role || 'Supervisor'}
                              </span>
                            </td>
                            <td>
                              {isRevoked ? (
                                <span className="pill pr" style={{ fontSize: '10px', fontWeight: 600 }}>Revoked</span>
                              ) : online ? (
                                <span className="pill pg" style={{ fontSize: '10px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  ● Logged In
                                </span>
                              ) : (
                                <span className="pill pd" style={{ fontSize: '10px', color: 'var(--text3)' }}>Offline</span>
                              )}
                            </td>
                            <td style={{ fontSize: '11px', color: 'var(--text2)' }}>
                              {formatLastSeen(p)}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button className="btn bpri" style={{ height: '26px', padding: '0 8px', fontSize: '10px' }} onClick={() => editProfile(p)}>Edit</button>
                                <select 
                                  className="fi" 
                                  style={{ height: '26px', padding: '0 6px', fontSize: '11px', minWidth: '95px' }}
                                  value={p.role || 'Supervisor'}
                                  onChange={(e) => updateUserRole(p.id, e.target.value)}
                                >
                                  {userTypes.map(role => (
                                    <option key={role} value={role}>{role}</option>
                                  ))}
                                </select>

                                {/* Manual Force Logout */}
                                <button 
                                  className="btn bwrn" 
                                  style={{ height: '26px', padding: '0 8px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  disabled={p.id === currentUserId}
                                  title={p.id === currentUserId ? "Cannot logout own active session" : "Force logout this user"}
                                  onClick={() => forceLogoutUser(p)}
                                >
                                  <LogOut size={11} />
                                  <span>Logout</span>
                                </button>

                                {/* Revoke / Restore Access */}
                                {!isRevoked ? (
                                  <button 
                                    className="btn bdan" 
                                    style={{ height: '26px', padding: '0 8px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    disabled={p.id === currentUserId}
                                    title={p.id === currentUserId ? "Cannot revoke own access" : "Revoke user access"}
                                    onClick={() => toggleRevokeAccess(p)}
                                  >
                                    <UserX size={11} />
                                    <span>Revoke</span>
                                  </button>
                                ) : (
                                  <button 
                                    className="btn bpri" 
                                    style={{ height: '26px', padding: '0 8px', fontSize: '10px', background: 'var(--green)', borderColor: 'var(--green)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    title="Restore user access"
                                    onClick={() => toggleRevokeAccess(p)}
                                  >
                                    <UserCheck size={11} />
                                    <span>Restore</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                 </div>

                 <div style={{ width: '300px', borderLeft: '1px solid var(--border)', paddingLeft: '16px' }}>
                   <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>Whitelist (Invites)</div>
                   <table className="dt">
                      <thead>
                        <tr><th>Email</th><th></th></tr>
                      </thead>
                      <tbody>
                        {supervisors.map(s => (
                          <tr key={s.email}>
                            <td className="mono" style={{ fontSize: '11px' }}>{s.email} {s.employee_code && <span style={{color:'var(--purple)'}}>[{s.employee_code}]</span>}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button className="btn bsm" onClick={() => { setEditingSupervisor(s.email); setNewSupervisor({ email: s.email, fullName: s.full_name, employeeCode: s.employee_code || '' }); }}><Edit2 size={12} /></button>
                                <button className="btn bsm" style={{ color: 'var(--red)' }} onClick={() => removeSupervisor(s.email)}><Trash2 size={12} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                 </div>
              </div>
            </div>
          </div>

          {/* User Types & Module Access Levels (RBAC) */}
          <div className="card" style={{ marginTop: '16px' }}>
            <div className="ch" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <span className="ct2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={15} /> User Types & Module Access Levels (RBAC)
              </span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <input
                    className="fi"
                    placeholder="New User Type (e.g. Technician)"
                    value={newUserType}
                    onChange={(e) => setNewUserType(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddUserType()}
                    style={{ height: '30px', fontSize: '12px', minWidth: '180px' }}
                  />
                  <button
                    className="btn bsec bsm"
                    onClick={handleAddUserType}
                    disabled={!newUserType.trim()}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    title="Add new user type"
                  >
                    <Plus size={13} />
                    <span>Add User Type</span>
                  </button>
                </div>
                <button 
                  className="btn bsec bsm" 
                  onClick={() => setRolePermissions(DEFAULT_ROLE_PERMISSIONS)}
                  title="Reset to default access levels"
                >
                  Reset Defaults
                </button>
                <button 
                  className="btn bpri bsm" 
                  onClick={saveAccessLevels}
                  disabled={isSavingPermissions}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, padding: '6px 14px' }}
                >
                  {isSavingPermissions ? <RefreshCcw size={13} className="spin" /> : <ShieldCheck size={13} />}
                  <span>Save Access Levels</span>
                </button>
              </div>
            </div>
            <div className="cb">
              <p style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '16px', lineHeight: '1.5' }}>
                Select which modules and features each user type can access. For example, QC users have access to QC Inspections, Packing App, Batch Logs, and Shift Logs.
              </p>

              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <table className="dt" style={{ width: '100%', minWidth: '780px', margin: 0 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <th style={{ textAlign: 'left', minWidth: '220px', padding: '12px 16px' }}>Module / Feature</th>
                      {userTypes.map(role => (
                        <th key={role} style={{ textAlign: 'center', minWidth: '85px', padding: '12px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <span style={{ fontWeight: 700, fontSize: '12px' }}>{role}</span>
                            {!DEFAULT_USER_TYPES.includes(role) && (
                              <button
                                onClick={() => handleDeleteUserType(role)}
                                title={`Delete user type "${role}"`}
                                style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '0 2px' }}
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { id: 'Live Dashboard', label: 'Live Dashboard', desc: 'Real-time plant output, OEE & active machine status' },
                      { id: 'Shop Floor', label: 'Shop Floor', desc: 'Live unit output, ongoing job cards & machine controls' },
                      { id: 'Planning & Labels', label: 'Production Planning', desc: 'Batch planning, Avery labels & waste elimination queue' },
                      { id: 'Inspections', label: 'QC Inspections', desc: 'First-Article inspection & defect categorization' },
                      { id: 'Packing', label: 'Packing App', desc: 'Secondary packaging, box scanning & barcode labels' },
                      { id: 'Batch Log', label: 'Batch Logs', desc: 'Batch traceability, lot genealogy & bin breakdown' },
                      { id: 'Shift Log', label: 'Shift Logs', desc: 'Shift output logs & supervisor handover records' },
                      { id: 'Breakdowns', label: 'Breakdowns', desc: 'Maintenance downtime & resolution logging' },
                      { id: 'Machines', label: 'Admin Console', desc: 'Registry, moulds, products, materials & user access' },
                      { id: 'About', label: 'System Info & About', desc: 'Platform version, build information & documentation' },
                    ].map((mod, idx) => (
                      <tr key={mod.id} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>{mod.label}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{mod.desc}</div>
                        </td>
                        {userTypes.map(role => {
                          const isChecked = (rolePermissions[role] || []).includes(mod.id);
                          const isAdminRole = role === 'Admin';
                          return (
                            <td key={role} style={{ textAlign: 'center', verticalAlign: 'middle', padding: '10px 8px' }}>
                              <label style={{ 
                                cursor: isAdminRole ? 'not-allowed' : 'pointer', 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                padding: '4px',
                                borderRadius: '4px',
                                transition: 'background 0.2s'
                              }}>
                                <input
                                  type="checkbox"
                                  checked={isAdminRole || isChecked}
                                  disabled={isAdminRole}
                                  onChange={() => !isAdminRole && togglePermission(role, mod.id)}
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    cursor: isAdminRole ? 'not-allowed' : 'pointer',
                                    accentColor: 'var(--blue)',
                                  }}
                                  title={isAdminRole ? 'Admin has all permissions by default' : `Toggle ${mod.label} for ${role}`}
                                />
                              </label>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'planning' && (
        <div className="animate-fade-in" style={{ marginBottom: '24px' }}>
          <ProductionPlannerModule
            currentUser={{
              id: currentUserId || '',
              name: currentUserName || 'Admin',
              email: '',
              role: currentUserRole || 'Admin',
            }}
            products={products}
            machines={machines}
          />
        </div>
      )}

      {activeTab === 'shifts' && (
        <div className="card animate-scale-in">
          <div className="ch">
            <span className="ct2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={14} /> Production Shifts Configuration
            </span>
          </div>
          <div className="cb">
            <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '16px', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
              Define the exact start and end times for shifts. The system will auto-detect the active shift during handover based on these windows.
            </p>

            <table className="dt">
              <thead>
                <tr>
                  <th>Shift Name</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {shiftSettings.map(s => <ShiftRow key={s.id} s={s} updateShiftTiming={updateShiftTiming} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'defects' && (
        <div className="card animate-scale-in">
          <div className="ch">
            <span className="ct2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={14} /> Defect Type Registry
            </span>
          </div>
          <div className="cb">
             <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input 
                className="fi" 
                placeholder="New Defect Name (e.g. Flash)" 
                value={newDefect} 
                onChange={e => setNewDefect(e.target.value)} 
              />
              <button 
                className="btn bpri" 
                onClick={async () => {
                  if (!newDefect) return;
                  const { error } = await supabase.from('defect_types').insert({ id: `D${Date.now()}`, name: newDefect });
                  if (error) showError(error.message);
                  else {
                    showSuccess(`Defect type ${newDefect} added.`);
                    setNewDefect('');
                  }
                }}
              >
                <Plus size={16} />
              </button>
            </div>
            <table className="dt">
              <thead>
                <tr><th>Defect Name</th><th>Action</th></tr>
              </thead>
              <tbody>
                {defectTypes.map(d => (
                  <tr key={d.id}>
                    <td>
                      {editingDefectId === d.id ? (
                        <input 
                          className="fi bsm" 
                          value={editingDefectName} 
                          onChange={e => setEditingDefectName(e.target.value)} 
                          autoFocus
                        />
                      ) : (
                        <span style={{ fontWeight: 500 }}>{d.name}</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {editingDefectId === d.id ? (
                          <>
                            <button 
                              className="btn bsm bpri" 
                              onClick={async () => {
                                const { error } = await supabase.from('defect_types').update({ name: editingDefectName }).eq('id', d.id);
                                if (error) showError(error.message);
                                else {
                                  showSuccess('Defect updated');
                                  setEditingDefectId(null);
                                }
                              }}
                            >
                              Save
                            </button>
                            <button className="btn bsm bsec" onClick={() => setEditingDefectId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button 
                              className="btn bsm" 
                              style={{ color: 'var(--blue)' }} 
                              onClick={() => {
                                setEditingDefectId(d.id);
                                setEditingDefectName(d.name);
                              }}
                            >
                              <Edit2 size={12} />
                            </button>
                            <button 
                              className="btn bsm" 
                              style={{ color: 'var(--red)' }} 
                              onClick={async () => {
                                if (!confirm(`Delete defect type "${d.name}"?`)) return;
                                const { error } = await supabase.from('defect_types').delete().eq('id', d.id);
                                if (error) showError(error.message);
                                else showSuccess(`Defect type deleted.`);
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'breakdowns' && (
        <div className="card animate-scale-in">
          <div className="ch">
            <span className="ct2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Wrench size={14} /> Breakdown Reason Registry
            </span>
          </div>
          <div className="cb">
             <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input 
                className="fi" 
                placeholder="New Reason (e.g. Hydraulic Leak)" 
                value={newReason} 
                onChange={e => setNewReason(e.target.value)} 
              />
              <button 
                className="btn bpri" 
                onClick={async () => {
                  if (!newReason) return;
                  const { error } = await supabase.from('breakdown_reasons').insert({ id: `B${Date.now()}`, name: newReason });
                  if (error) showError(error.message);
                  else {
                    showSuccess(`Reason "${newReason}" added.`);
                    setNewReason('');
                  }
                }}
              >
                <Plus size={16} />
              </button>
            </div>
            <table className="dt">
              <thead>
                <tr><th>Reason Name</th><th>Action</th></tr>
              </thead>
              <tbody>
                {breakdownReasons.map(r => (
                  <tr key={r.id}>
                    <td>
                      {editingReasonId === r.id ? (
                        <input 
                          className="fi bsm" 
                          value={editingReasonName} 
                          onChange={e => setEditingReasonName(e.target.value)} 
                          autoFocus
                        />
                      ) : (
                        <span style={{ fontWeight: 500 }}>{r.name}</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {editingReasonId === r.id ? (
                          <>
                            <button 
                              className="btn bsm bpri" 
                              onClick={async () => {
                                const { error } = await supabase.from('breakdown_reasons').update({ name: editingReasonName }).eq('id', r.id);
                                if (error) showError(error.message);
                                else {
                                  showSuccess('Reason updated');
                                  setEditingReasonId(null);
                                }
                              }}
                            >
                              Save
                            </button>
                            <button className="btn bsm bsec" onClick={() => setEditingReasonId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button 
                              className="btn bsm" 
                              style={{ color: 'var(--blue)' }} 
                              onClick={() => {
                                setEditingReasonId(r.id);
                                setEditingReasonName(r.name);
                              }}
                            >
                              <Edit2 size={12} />
                            </button>
                            <button 
                              className="btn bsm" 
                              style={{ color: 'var(--red)' }} 
                              onClick={async () => {
                                if (!confirm(`Delete reason "${r.name}"?`)) return;
                                const { error } = await supabase.from('breakdown_reasons').delete().eq('id', r.id);
                                if (error) showError(error.message);
                                else showSuccess(`Reason deleted.`);
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {activeTab === 'checklist' && (
        <div className="card animate-scale-in">
          <div className="ch">
            <span className="ct2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={14} /> Startup Checklist Registry
            </span>
          </div>
          <div className="cb">
             <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input 
                className="fi" 
                placeholder="New Task (e.g. Check Oil Levels)" 
                value={newTask} 
                onChange={e => setNewTask(e.target.value)} 
              />
              <button 
                className="btn bpri" 
                onClick={async () => {
                  const taskId = `C${Date.now()}`;
                  const { error } = await supabase.from('cleaning_tasks').insert({ id: taskId, label: newTask });
                  if (error) showError(error.message);
                  else {
                    showSuccess('Task added');
                    logSystemChange({
                      module: 'Cleaning Checklist',
                      tableName: 'cleaning_tasks',
                      recordId: taskId,
                      action: 'CREATE',
                      newValue: newTask,
                      reason: `Added startup checklist task: ${newTask}`,
                      changedByName: currentUserName,
                      changedByRole: currentUserRole,
                      changedById: currentUserId,
                    });
                    setNewTask('');
                  }
                }}
              >
                <Plus size={16} />
              </button>
            </div>
            <table className="dt">
              <thead>
                <tr><th>Task Description</th><th>Action</th></tr>
              </thead>
              <tbody>
                {cleaningTasks.map(t => (
                  <tr key={t.id}>
                    <td>
                      {editingTaskId === t.id ? (
                        <input className="fi bsm" value={editingTaskLabel} onChange={e => setEditingTaskLabel(e.target.value)} autoFocus />
                      ) : (
                        <span style={{ fontWeight: 500 }}>{t.label}</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {editingTaskId === t.id ? (
                          <>
                            <button className="btn bsm bpri" onClick={async () => {
                              const oldLabel = t.label;
                              const { error } = await supabase.from('cleaning_tasks').update({ label: editingTaskLabel }).eq('id', t.id);
                              if (error) showError(error.message);
                              else { 
                                showSuccess('Updated'); 
                                logSystemChange({
                                  module: 'Cleaning Checklist',
                                  tableName: 'cleaning_tasks',
                                  recordId: t.id,
                                  action: 'UPDATE',
                                  oldValue: oldLabel,
                                  newValue: editingTaskLabel,
                                  reason: `Updated checklist task description`,
                                  changedByName: currentUserName,
                                  changedByRole: currentUserRole,
                                  changedById: currentUserId,
                                });
                                setEditingTaskId(null); 
                              }
                            }}>Save</button>
                            <button className="btn bsm bsec" onClick={() => setEditingTaskId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="btn bsm" style={{ color: 'var(--blue)' }} onClick={() => { setEditingTaskId(t.id); setEditingTaskLabel(t.label); }}><Edit2 size={12}/></button>
                            <button className="btn bsm" style={{ color: 'var(--red)' }} onClick={async () => {
                              if (!confirm(`Delete task "${t.label}"?`)) return;
                              const { error } = await supabase.from('cleaning_tasks').delete().eq('id', t.id);
                              if (error) showError(error.message);
                              else {
                                showSuccess('Deleted');
                                logSystemChange({
                                  module: 'Cleaning Checklist',
                                  tableName: 'cleaning_tasks',
                                  recordId: t.id,
                                  action: 'DELETE',
                                  oldValue: t.label,
                                  reason: `Deleted checklist task: ${t.label}`,
                                  changedByName: currentUserName,
                                  changedByRole: currentUserRole,
                                  changedById: currentUserId,
                                });
                              }
                            }}><Trash2 size={12}/></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* ── System Info / Version Panel ───────────────────────────── */}
      <div style={{ marginTop: '32px', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--blue-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>⚙️</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>IM-MES Platform</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>Industrial Manufacturing Execution System</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>App Version</div>
              <div style={{
                fontFamily: 'monospace', fontWeight: 700, fontSize: '15px',
                color: 'var(--blue)', background: 'var(--blue-dim)',
                padding: '3px 10px', borderRadius: '6px'
              }}>
                v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.3.0'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Build Date</div>
              <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>
                {typeof __APP_BUILD_DATE__ !== 'undefined' ? __APP_BUILD_DATE__ : new Date().toISOString().split('T')[0]}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Backend</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>Supabase / PostgREST</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Stack</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>Vite · React · Capacitor</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Satellite apps:</span>
          {[
            { label: 'QC Inspector', branch: 'apps/inspector', version: '0.3.0' },
            { label: 'Packing App', branch: 'apps/packing', version: '1.0.0' },
          ].map(app => (
            <span key={app.branch} style={{
              fontSize: '11px', padding: '2px 8px', borderRadius: '6px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
              fontFamily: 'monospace', color: 'var(--text2)'
            }}>
              {app.label} <span style={{ color: 'var(--blue)' }}>v{app.version}</span>
              <span style={{ color: 'var(--text3)', marginLeft: '4px' }}>({app.branch})</span>
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text3)' }}>
            Branch: <code style={{ color: 'var(--purple)', fontFamily: 'monospace' }}>feature/versioning-stage1</code>
          </span>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
