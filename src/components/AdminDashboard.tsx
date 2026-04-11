import React, { useState } from 'react';
import { Plus, Trash2, Users, Box, Layers, Database, Cpu, RefreshCcw, Edit2, X, ShieldCheck, Clock } from 'lucide-react';
import type { Machine, Operator, Mould, Product, RawMaterial, ProductMaterial, ShiftSetting } from '../types';
import { supabase } from '../lib/supabase';

interface AdminDashboardProps {
  machines: Machine[];
  operators: Operator[];
  moulds: Mould[];
  products: Product[];
  rawMaterials: RawMaterial[];
  productMaterials: ProductMaterial[];
  supervisors: { email: string, full_name: string, employee_code?: string }[];
  shiftSettings: ShiftSetting[];
  currentUserRole: string;
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

const AdminDashboard: React.FC<AdminDashboardProps> = ({ machines, operators, moulds, products, rawMaterials, productMaterials, supervisors, shiftSettings, currentUserRole }) => {
  const [activeTab, setActiveTab] = useState<'machines' | 'moulds' | 'products' | 'materials' | 'operators' | 'shifts' | 'users'>('machines');
  const [profiles, setProfiles] = useState<{ id: string, email: string, full_name: string, role: string, employee_code?: string }[]>([]);
  const [newSupervisor, setNewSupervisor] = useState({ email: '', fullName: '', employeeCode: '' });
  const [newOperator, setNewOperator] = useState({ name: '', employeeId: '' });
  const [newMould, setNewMould] = useState({ id: '', name: '', cavities: 4, cycleTime: 20 });
  const [newProduct, setNewProduct] = useState({ name: '', mouldId: '', itemCode: '', batchIdentifier: '', binQty: 4000, stdPackSize: 1000 });
  const [newMaterial, setNewMaterial] = useState({ id: '', name: '', vendor: '' });
  const [newMachine, setNewMachine] = useState({ id: '', name: '', model: '' });

  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editingOperator, setEditingOperator] = useState<string | null>(null);
  const [editingMould, setEditingMould] = useState<string | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<string | null>(null);
  const [editingSupervisor, setEditingSupervisor] = useState<string | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingMachine, setEditingMachine] = useState<string | null>(null);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      if (data) setProfiles(data.map(p => ({ id: p.id, email: p.email, full_name: p.full_name, role: p.role, employee_code: p.employee_code })));
    };
    fetchProfiles();
    
    // Subscribe to profile changes
    const sub = supabase.channel('profiles_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchProfiles)
      .subscribe();
      
    return () => { supabase.removeChannel(sub); };
  }, []);

  const updateShiftTiming = async (id: string, startTime: string, endTime: string) => {
    if (!startTime || !endTime) return;
    const { error } = await supabase.from('shift_settings').update({ start_time: startTime, end_time: endTime }).eq('id', id);
    if (error) {
      showError(`Error updating shift: ${error.message}`);
    } else {
      showSuccess(`Shift ${id} updated to ${startTime} - ${endTime}`);
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
          id: `P${Date.now()}`
        });
      error = insertError;
    }

    if (error) {
      console.error('Error saving product:', error);
      alert(`Failed to save product: ${error.message}`);
      return;
    }

    showSuccess(`Product ${newProduct.name} ${editingProduct ? 'updated' : 'added'}.`);
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
    const { error = null } = await supabase.from('products').delete().eq('id', id);
    if (error) { 
      console.error('Error deleting product:', error); 
      alert(`Cannot delete product: ${error.message}`); 
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
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (error) {
      alert(`Error updating role: ${error.message}`);
    } else {
      showSuccess(`User role updated to ${newRole}`);
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, role: newRole } : p));
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
          <TabButton id="materials" label="Materials" icon={Database} />
          <TabButton id="operators" label="Operators" icon={Users} />
          {currentUserRole === 'Admin' && (
            <TabButton id="users" label="User Management" icon={ShieldCheck} />
          )}
          <TabButton id="shifts" label="Shift Setup" icon={Clock} />
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
                      <tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {profiles.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.full_name || 'No Name'} <span style={{fontSize:'10px', color:'var(--text3)'}}>{p.employee_code && `(${p.employee_code})`}</span></td>
                          <td className="mono" style={{ color: 'var(--text2)' }}>{p.email}</td>
                          <td>
                            <span className={`pill ${p.role === 'Admin' ? 'pg' : p.role === 'PowerUser' ? 'pp' : 'pd'}`}>
                              {p.role || 'Supervisor'}
                            </span>
                          </td>
                          <td style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button className="btn bpri" style={{ height: '28px', padding: '0 8px', fontSize: '10px' }} onClick={() => editProfile(p)}>Edit</button>
                            <select 
                              className="fi" 
                              style={{ height: '28px', padding: '0 8px', fontSize: '11px', flex: 1 }}
                              value={p.role || 'Supervisor'}
                              onChange={(e) => updateUserRole(p.id, e.target.value)}
                            >
                              <option value="Supervisor">Supervisor</option>
                              <option value="PowerUser">PowerUser</option>
                              <option value="Admin">Admin</option>
                            </select>
                          </td>
                        </tr>
                      ))}
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
    </div>
  );
};

export default AdminDashboard;
