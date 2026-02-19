import React, { useState, useEffect } from 'react';
import { Globe, Plus, Search, Pencil } from 'lucide-react';
import { GlassPanel, EmptyState, cn } from '../components/shared';
import { postTool } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';

interface Domain {
  id: string;
  name: string;
  domain?: string; // API returns domain; we use name for display
  registrar: string | null;
  expiry_date: string | null;
  notes?: string | null;
  auto_renew?: number;
  status: string;
}

// Same validation as backend — legitimate domain format only
const DOMAIN_REGEX =
  /^(?=.{1,253}$)(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[A-Za-z]{2,63}$/;
function normalizeDomain(s: string): string {
  return s.trim().toLowerCase().replace(/\.$/, '');
}
function isValidDomain(s: string): boolean {
  return DOMAIN_REGEX.test(normalizeDomain(s));
}

function fetchDomains(idToken: string | null | undefined): Promise<Domain[]> {
  return postTool('queryDomains', {}, idToken)
    .then((res) => {
      const raw = res.ok && res.result ? (res.result as { domains?: unknown[] }).domains : null;
      if (!Array.isArray(raw)) return [];
      return raw.map((d: Record<string, unknown>) => ({
        ...d,
        name: (d.domain ?? d.name) as string,
        id: d.id as string,
        registrar: (d.registrar ?? null) as string | null,
        expiry_date: (d.expiry_date ?? null) as string | null,
        notes: (d.notes ?? null) as string | null,
        status: (d.status ?? 'active') as string,
      })) as Domain[];
    })
    .catch(() => []);
}

export default function DomainsPage() {
  const { idToken } = useAuth();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addDomain, setAddDomain] = useState('');
  const [addRegistrar, setAddRegistrar] = useState('');
  const [addExpiryDate, setAddExpiryDate] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [addError, setAddError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null);
  const [editRegistrar, setEditRegistrar] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState<string>('active');
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const loadDomains = () => {
    setLoading(true);
    fetchDomains(idToken)
      .then(setDomains)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDomains();
  }, [idToken]);

  const handleAddDomain = () => {
    setAddError('');
    const raw = addDomain.trim();
    if (!raw) {
      setAddError('Domain is required.');
      return;
    }
    const normalized = normalizeDomain(raw);
    if (!isValidDomain(normalized)) {
      setAddError('Please enter a valid domain (e.g. example.com).');
      return;
    }
    setSubmitting(true);
    const params: Record<string, string | undefined> = {
      domain: normalized,
      registrar: addRegistrar.trim() || undefined,
      expiryDate: addExpiryDate.trim() || undefined,
      notes: addNotes.trim() || undefined,
    };
    postTool('addDomain', params, idToken)
      .then((res) => {
        if (res.ok) {
          setAddOpen(false);
          setAddDomain('');
          setAddRegistrar('');
          setAddExpiryDate('');
          setAddNotes('');
          loadDomains();
        } else {
          setAddError(res.error ?? 'Failed to add domain.');
        }
      })
      .catch(() => setAddError('Failed to add domain. Please try again.'))
      .finally(() => setSubmitting(false));
  };

  const openEdit = (d: Domain) => {
    setEditingDomain(d);
    setEditRegistrar(d.registrar ?? '');
    setEditExpiryDate(d.expiry_date ? String(d.expiry_date).slice(0, 10) : '');
    setEditNotes(d.notes ?? '');
    setEditStatus(d.status ?? 'active');
    setEditError('');
    setEditOpen(true);
  };

  const handleEditDomain = () => {
    if (!editingDomain) return;
    setEditError('');
    setEditSubmitting(true);
    const params: Record<string, string | null | undefined> = {
      domain: editingDomain.name,
      registrar: editRegistrar.trim() || null,
      expiryDate: editExpiryDate.trim() || null,
      notes: editNotes.trim() || null,
      status: editStatus,
    };
    postTool('updateDomain', params, idToken)
      .then((res) => {
        if (res.ok) {
          setEditOpen(false);
          setEditingDomain(null);
          loadDomains();
        } else {
          setEditError(res.error ?? 'Failed to update domain.');
        }
      })
      .catch(() => setEditError('Failed to update domain. Please try again.'))
      .finally(() => setEditSubmitting(false));
  };

  const filtered = domains.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium text-white flex items-center gap-2">
          <Globe className="w-5 h-5 text-white/80" />
          Domains
        </h1>
        <Button
          onClick={() => {
            setAddError('');
            setAddOpen(true);
          }}
          className="bg-white/10 hover:bg-white/20 border border-white/20 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add domain
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-black border-white/10 text-white gap-4">
          <DialogHeader>
            <DialogTitle className="text-white">Add domain</DialogTitle>
            <DialogDescription className="text-white/60">
              Add a domain to your portfolio. Domain must be a valid format (e.g. example.com).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="domain" className="text-white/80">Domain *</Label>
              <Input
                id="domain"
                value={addDomain}
                onChange={(e) => setAddDomain(e.target.value)}
                placeholder="example.com"
                className="bg-white/5 border-white/10 text-white placeholder-white/30"
                disabled={submitting}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="registrar" className="text-white/80">Registrar (optional)</Label>
              <Input
                id="registrar"
                value={addRegistrar}
                onChange={(e) => setAddRegistrar(e.target.value)}
                placeholder="e.g. Namecheap, Cloudflare"
                className="bg-white/5 border-white/10 text-white placeholder-white/30"
                disabled={submitting}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expiry" className="text-white/80">Expiry date (optional)</Label>
              <Input
                id="expiry"
                type="date"
                value={addExpiryDate}
                onChange={(e) => setAddExpiryDate(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
                disabled={submitting}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes" className="text-white/80">Notes (optional)</Label>
              <textarea
                id="notes"
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                placeholder="Any notes about this domain"
                rows={2}
                className={cn(
                  'flex w-full rounded-md border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder-white/30',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
                )}
                disabled={submitting}
              />
            </div>
            {addError && (
              <p className="text-sm text-red-400">{addError}</p>
            )}
          </div>
          <DialogFooter className="gap-4 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              className="border-white/40 bg-white/5 text-white hover:bg-white/15 hover:border-white/50"
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddDomain}
              disabled={submitting}
              className="bg-white text-black hover:bg-white/90 ml-2"
            >
              {submitting ? 'Adding…' : 'Add domain'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-black border-white/10 text-white gap-4">
          <DialogHeader>
            <DialogTitle className="text-white">Edit domain</DialogTitle>
            <DialogDescription className="text-white/60">
              Update registrar, expiry date, notes, or status. Domain name cannot be changed.
            </DialogDescription>
          </DialogHeader>
          {editingDomain && (
            <>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label className="text-white/80">Domain</Label>
                  <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-mono text-white/70">
                    {editingDomain.name}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-registrar" className="text-white/80">Registrar</Label>
                  <Input
                    id="edit-registrar"
                    value={editRegistrar}
                    onChange={(e) => setEditRegistrar(e.target.value)}
                    placeholder="e.g. Namecheap, Cloudflare"
                    className="bg-white/5 border-white/10 text-white placeholder-white/30"
                    disabled={editSubmitting}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-expiry" className="text-white/80">Expiry date</Label>
                  <Input
                    id="edit-expiry"
                    type="date"
                    value={editExpiryDate}
                    onChange={(e) => setEditExpiryDate(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                    disabled={editSubmitting}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-status" className="text-white/80">Status</Label>
                  <select
                    id="edit-status"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className={cn(
                      'flex h-9 w-full rounded-md border px-3 py-1 text-sm bg-white/5 border-white/10 text-white',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
                    )}
                    disabled={editSubmitting}
                  >
                    <option value="active">active</option>
                    <option value="parked">parked</option>
                    <option value="for_sale">for_sale</option>
                    <option value="expired">expired</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-notes" className="text-white/80">Notes</Label>
                  <textarea
                    id="edit-notes"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Any notes about this domain"
                    rows={2}
                    className={cn(
                      'flex w-full rounded-md border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder-white/30',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
                    )}
                    disabled={editSubmitting}
                  />
                </div>
                {editError && (
                  <p className="text-sm text-red-400">{editError}</p>
                )}
              </div>
              <DialogFooter className="gap-4 sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => setEditOpen(false)}
                  className="border-white/40 bg-white/5 text-white hover:bg-white/15 hover:border-white/50"
                  disabled={editSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleEditDomain}
                  disabled={editSubmitting}
                  className="bg-white text-black hover:bg-white/90 ml-2"
                >
                  {editSubmitting ? 'Saving…' : 'Save changes'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Search */}
      <GlassPanel className="p-3" intensity="low">
        <div className="flex items-center gap-2 px-2">
          <Search className="w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Search domains..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder-white/30"
          />
        </div>
      </GlassPanel>

      {loading ? (
        <GlassPanel className="p-8">
          <div className="flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          </div>
        </GlassPanel>
      ) : filtered.length === 0 ? (
        <GlassPanel className="p-4">
          <EmptyState
            icon={Globe}
            title="No domains yet"
            description="Add your first domain using the chat — just say 'Add domain example.com'."
          />
        </GlassPanel>
      ) : (
        <GlassPanel className="p-0 overflow-hidden" intensity="low">
          <table className="w-full text-left text-sm">
            <thead className="text-white/40 text-xs font-medium border-b border-white/10">
              <tr>
                <th className="px-5 py-3">Domain</th>
                <th className="px-5 py-3">Registrar</th>
                <th className="px-5 py-3">Expiry</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 w-12" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-5 py-3 font-mono text-white/90">{d.name}</td>
                  <td className="px-5 py-3 text-white/60">{d.registrar ?? '—'}</td>
                  <td className="px-5 py-3 text-white/60 font-mono text-xs">
                    {d.expiry_date ?? '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full border',
                        d.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-white/5 text-white/50 border-white/10',
                      )}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(d);
                      }}
                      className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                      title="Edit domain"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      )}
    </div>
  );
}
