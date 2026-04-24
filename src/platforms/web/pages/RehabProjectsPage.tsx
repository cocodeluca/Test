import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Filter,
  Hammer,
  LayoutGrid,
  List,
  Plus,
  Receipt,
  Upload,
} from 'lucide-react';
import type {
  Opportunity,
  OpportunityAttachment,
  Property,
  RehabProject,
  RehabScenario,
  RehabStage,
  RehabTask,
} from '../../../common/types';
import { formatCurrency, formatDate, formatPercentage } from '../../../common/utils/formatting';
import {
  calculateRehabAnalysis,
  createEmptyRehabProject,
  createProjectFromOpportunity,
  createProjectFromProperty,
  createRehabTask,
  enrichRehabProject,
  rehabScenarioLabels,
  rehabStageLabels,
  rehabStrategyLabels,
} from '../../../common/utils/rehabProjects';
import { createAttachmentFromFile } from '../../../common/utils/opportunities';
import { useSettings } from '../context/SettingsContext';
import {
  appBorderClass,
  appButtonMutedClass,
  appButtonPrimaryClass,
  appInputClass,
  appPanelClass,
  appPanelInsetClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

type RehabTab = 'projects' | 'budget' | 'timeline' | 'tasks' | 'documents' | 'analysis';
type RehabView = 'cards' | 'list';

interface RehabProjectsPageProps {
  projects: RehabProject[];
  opportunities: Opportunity[];
  properties: Property[];
  onAddProject: (project: RehabProject) => void;
  onUpdateProject: (project: RehabProject) => void;
  onDeleteProject: (id: string) => void;
  onGenerateReport: (sourceType: 'opportunity' | 'property' | 'rehab', sourceId: string) => void;
  initialTab?: RehabTab;
}

const labelClass = `mb-2 block text-sm font-medium ${appTextMutedClass}`;
const inputClass = `w-full ${appInputClass}`;

const warningTone: Record<string, string> = {
  good: 'border-emerald-300/60 bg-emerald-50/70 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300',
  watch: 'border-amber-300/60 bg-amber-50/70 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300',
  risk: 'border-rose-300/60 bg-rose-50/70 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300',
};

const projectStageOptions = Object.keys(rehabStageLabels) as RehabStage[];

const ProjectEditor: React.FC<{
  project: RehabProject;
  opportunities: Opportunity[];
  properties: Property[];
  onChange: (project: RehabProject) => void;
  onClose: () => void;
}> = ({ project, opportunities, properties, onChange, onClose }) => {
  const setField = (field: keyof RehabProject, value: string | number) =>
    onChange(enrichRehabProject({ ...project, [field]: value }));

  const updateBudget = (index: number, field: 'category' | 'budgeted' | 'actual' | 'notes', value: string | number) => {
    const budgetLines = project.budgetLines.map((line, currentIndex) =>
      currentIndex === index ? { ...line, [field]: value } : line
    );
    onChange(enrichRehabProject({ ...project, budgetLines }));
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-auto bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
      <div className={`mx-auto max-w-6xl ${appPanelClass} rounded-[30px] p-5`}>
        <div className="flex items-center justify-between gap-3 border-b pb-4">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${appTextSoftClass}`}>Project Setup</p>
            <h2 className={`mt-2 text-2xl font-semibold ${appTextStrongClass}`}>{project.title}</h2>
          </div>
          <button type="button" onClick={onClose} className={`rounded-xl px-4 py-2 ${appButtonMutedClass} ${appTextMutedClass}`}>Close</button>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_360px]">
          <div className="space-y-5">
            <div className={`grid grid-cols-1 gap-4 ${appPanelInsetClass} rounded-[24px] p-4 sm:grid-cols-2`}>
              <div><label className={labelClass}>Project title</label><input value={project.title} onChange={(e) => setField('title', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Stage</label><select value={project.stage} onChange={(e) => setField('stage', e.target.value)} className={inputClass}>{projectStageOptions.map((stage) => <option key={stage} value={stage}>{rehabStageLabels[stage]}</option>)}</select></div>
              <div className="sm:col-span-2"><label className={labelClass}>Address</label><input value={project.address} onChange={(e) => setField('address', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>City</label><input value={project.city} onChange={(e) => setField('city', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Country</label><input value={project.country} onChange={(e) => setField('country', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Purchase price</label><input type="number" value={project.purchasePrice} onChange={(e) => setField('purchasePrice', Number(e.target.value || 0))} className={inputClass} /></div>
              <div><label className={labelClass}>Target resale price</label><input type="number" value={project.targetResalePrice} onChange={(e) => setField('targetResalePrice', Number(e.target.value || 0))} className={inputClass} /></div>
              <div><label className={labelClass}>Closing costs</label><input type="number" value={project.closingCosts} onChange={(e) => setField('closingCosts', Number(e.target.value || 0))} className={inputClass} /></div>
              <div><label className={labelClass}>Estimated selling costs</label><input type="number" value={project.estimatedSellingCosts} onChange={(e) => setField('estimatedSellingCosts', Number(e.target.value || 0))} className={inputClass} /></div>
              <div><label className={labelClass}>Holding period in months</label><input type="number" value={project.estimatedHoldingPeriodMonths} onChange={(e) => setField('estimatedHoldingPeriodMonths', Number(e.target.value || 0))} className={inputClass} /></div>
              <div><label className={labelClass}>Target rent if held</label><input type="number" value={project.targetRentalIncome} onChange={(e) => setField('targetRentalIncome', Number(e.target.value || 0))} className={inputClass} /></div>
              <div><label className={labelClass}>Linked opportunity</label><select value={project.linkedOpportunityId ?? ''} onChange={(e) => setField('linkedOpportunityId' as keyof RehabProject, e.target.value)} className={inputClass}><option value="">None</option>{opportunities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
              <div><label className={labelClass}>Linked property</label><select value={project.linkedPropertyId ?? ''} onChange={(e) => setField('linkedPropertyId' as keyof RehabProject, e.target.value)} className={inputClass}><option value="">None</option>{properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <div className="sm:col-span-2"><label className={labelClass}>Project thesis</label><textarea value={project.projectThesis} onChange={(e) => setField('projectThesis', e.target.value)} rows={4} className={inputClass} /></div>
            </div>

            <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
              <div className="flex items-center justify-between gap-3">
                <p className={`text-sm font-semibold ${appTextStrongClass}`}>Budget assumptions</p>
                <button type="button" onClick={() => onChange(enrichRehabProject({ ...project, budgetLines: [...project.budgetLines, { id: `custom-${Date.now()}`, category: 'Custom', budgeted: 0, actual: 0, notes: '' }] }))} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextMutedClass}`}>Add category</button>
              </div>
              <div className="mt-4 space-y-3">
                {project.budgetLines.slice(0, 6).map((line, index) => (
                  <div key={line.id} className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
                    <input value={line.category} onChange={(e) => updateBudget(index, 'category', e.target.value)} className={inputClass} />
                    <input type="number" value={line.budgeted} onChange={(e) => updateBudget(index, 'budgeted', Number(e.target.value || 0))} className={inputClass} />
                    <input type="number" value={line.actual} onChange={(e) => updateBudget(index, 'actual', Number(e.target.value || 0))} className={inputClass} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
              <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>Linked objects</p>
              <p className={`mt-2 text-sm ${appTextMutedClass}`}>Opportunity: {project.linkedOpportunityId || 'Not linked'}</p>
              <p className={`mt-1 text-sm ${appTextMutedClass}`}>Property: {project.linkedPropertyId || 'Not linked'}</p>
            </div>
            <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
              <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>Project health</p>
              <p className={`mt-2 text-3xl font-semibold ${appTextStrongClass}`}>{project.healthScore}</p>
              <p className={`mt-2 text-sm ${appTextMutedClass}`}>{project.healthStatus}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const RehabProjectsPage: React.FC<RehabProjectsPageProps> = ({
  projects,
  opportunities,
  properties,
  onAddProject,
  onUpdateProject,
  onDeleteProject,
  onGenerateReport,
  initialTab = 'projects',
}) => {
  const { settings, t } = useSettings();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<RehabTab>(initialTab);
  const [viewMode, setViewMode] = useState<RehabView>('cards');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projects[0]?.id ?? null);
  const [scenario, setScenario] = useState<RehabScenario>('base');
  const [editingProject, setEditingProject] = useState<RehabProject | null>(null);
  const [filters, setFilters] = useState({
    city: '',
    stage: 'all',
    strategy: 'all',
    minBudget: '',
    maxBudget: '',
    minProfit: '',
    maxProfit: '',
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const projectsWithMetrics = useMemo(
    () =>
      projects.map((project) => ({
        project,
        metrics: calculateRehabAnalysis(project, scenario),
      })),
    [projects, scenario]
  );

  const filteredProjects = useMemo(
    () =>
      projectsWithMetrics.filter(({ project, metrics }) => {
        if (filters.city && !project.city.toLowerCase().includes(filters.city.toLowerCase())) return false;
        if (filters.stage !== 'all' && project.stage !== filters.stage) return false;
        if (filters.strategy !== 'all' && project.strategy !== filters.strategy) return false;
        if (filters.minBudget && metrics.totalBudgetedRehab < Number(filters.minBudget)) return false;
        if (filters.maxBudget && metrics.totalBudgetedRehab > Number(filters.maxBudget)) return false;
        if (filters.minProfit && metrics.projectedNetProfit < Number(filters.minProfit)) return false;
        if (filters.maxProfit && metrics.projectedNetProfit > Number(filters.maxProfit)) return false;
        return true;
      }),
    [filters, projectsWithMetrics]
  );

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? filteredProjects[0]?.project ?? null;
  const selectedMetrics = selectedProject ? calculateRehabAnalysis(selectedProject, scenario) : null;

  const createManualProject = () => {
    const project = createEmptyRehabProject();
    onAddProject(project);
    setSelectedProjectId(project.id);
    setEditingProject(project);
    setActiveTab('projects');
  };

  const convertFromOpportunity = (opportunity?: Opportunity) => {
    const source = opportunity ?? opportunities[0];
    if (!source) return;
    const project = createProjectFromOpportunity(source);
    onAddProject(project);
    setSelectedProjectId(project.id);
    setActiveTab('projects');
  };

  const convertFromProperty = (property?: Property) => {
    const source = property ?? properties[0];
    if (!source) return;
    const project = createProjectFromProperty(source);
    onAddProject(project);
    setSelectedProjectId(project.id);
    setActiveTab('projects');
  };

  const projectWarnings = (project: RehabProject) => {
    const metrics = calculateRehabAnalysis(project, 'base');
    return [
      metrics.totalActualRehab > metrics.totalBudgetedRehab && { label: 'Over budget', tone: 'risk' },
      metrics.scheduleDelayDays > 14 && { label: 'Behind schedule', tone: 'risk' },
      metrics.profitMarginPct < 12 && { label: 'Low profit', tone: 'watch' },
      project.documents.filter((item) => item.type === 'other' || item.type === 'pdf').length < 2 && {
        label: 'Missing invoices',
        tone: 'watch',
      },
      metrics.contingencyBudget <= 0 && { label: 'Missing contingency', tone: 'risk' },
    ].filter(Boolean) as Array<{ label: string; tone: keyof typeof warningTone }>;
  };

  const updateSelectedProject = (updater: (project: RehabProject) => RehabProject) => {
    if (!selectedProject) return;
    onUpdateProject(enrichRehabProject(updater(selectedProject)));
  };

  const addTask = () =>
    updateSelectedProject((project) => ({
      ...project,
      tasks: [...project.tasks, createRehabTask()],
    }));

  const uploadFiles = async (files: FileList | null, type: OpportunityAttachment['type']) => {
    if (!selectedProject || !files?.length) return;
    const attachments = await Promise.all(Array.from(files).map((file) => createAttachmentFromFile(file, type)));
    updateSelectedProject((project) => ({
      ...project,
      mainImageUrl: project.mainImageUrl || (type === 'photo' ? attachments[0]?.url || '' : project.mainImageUrl),
      galleryImages: type === 'photo' ? [...project.galleryImages, ...attachments] : project.galleryImages,
      documents: type !== 'photo' ? [...project.documents, ...attachments] : project.documents,
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className={`text-[1.65rem] font-bold ${appTextStrongClass}`}>Flips / Rehabs</h1>
          <p className={`mt-1 text-sm ${appTextMutedClass}`}>Track renovation budgets, delays, documents, and live project profitability from purchase to sale.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={createManualProject} className={`inline-flex items-center gap-2 ${appButtonPrimaryClass}`}><Plus className="h-4.5 w-4.5" />Create project</button>
          <button type="button" onClick={() => convertFromOpportunity()} className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}>Convert from opportunity</button>
          <button type="button" onClick={() => convertFromProperty()} className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}>Convert from property</button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className={`${appPanelClass} rounded-[30px] p-10 text-center`}>
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] border border-cyan-400/18 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"><Hammer className="h-9 w-9" /></div>
          <h2 className={`mt-5 text-2xl font-semibold ${appTextStrongClass}`}>Build your rehab workspace</h2>
          <p className={`mx-auto mt-3 max-w-2xl text-sm leading-6 ${appTextMutedClass}`}>Create a renovation project, convert a deal from Opportunities, or prepare a value-add rental execution plan with budget, timeline, tasks, and analysis in one place.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={createManualProject} className={`inline-flex items-center gap-2 ${appButtonPrimaryClass}`}><Plus className="h-4.5 w-4.5" />Create project</button>
            <button type="button" onClick={() => convertFromOpportunity()} className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}>Convert from opportunity</button>
            <button type="button" onClick={() => convertFromProperty()} className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 ${appButtonMutedClass} ${appTextStrongClass}`}>Convert from property</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(['projects', 'budget', 'timeline', 'tasks', 'documents', 'analysis'] as RehabTab[]).map((tab) => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${activeTab === tab ? 'border border-cyan-400/28 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : `${appButtonMutedClass} ${appTextMutedClass}`}`}>{tab === 'projects' ? 'Projects' : tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
            ))}
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setViewMode('cards')} className={`rounded-xl p-2 ${viewMode === 'cards' ? 'border border-cyan-400/28 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : `${appButtonMutedClass} ${appTextMutedClass}`}`}><LayoutGrid className="h-4 w-4" /></button>
              <button type="button" onClick={() => setViewMode('list')} className={`rounded-xl p-2 ${viewMode === 'list' ? 'border border-cyan-400/28 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : `${appButtonMutedClass} ${appTextMutedClass}`}`}><List className="h-4 w-4" /></button>
            </div>
          </div>

          <div className={`grid grid-cols-1 gap-4 ${appPanelClass} rounded-[28px] p-4 xl:grid-cols-[300px_minmax(0,1fr)]`}>
            <div className={`${appPanelInsetClass} rounded-[24px] p-4`}>
              <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-cyan-500" /><p className={`text-sm font-semibold ${appTextStrongClass}`}>Filters</p></div>
              <div className="mt-4 grid grid-cols-1 gap-3">
                <input placeholder="City" value={filters.city} onChange={(e) => setFilters((current) => ({ ...current, city: e.target.value }))} className={inputClass} />
                <select value={filters.stage} onChange={(e) => setFilters((current) => ({ ...current, stage: e.target.value }))} className={inputClass}><option value="all">All stages</option>{projectStageOptions.map((stage) => <option key={stage} value={stage}>{rehabStageLabels[stage]}</option>)}</select>
                <select value={filters.strategy} onChange={(e) => setFilters((current) => ({ ...current, strategy: e.target.value }))} className={inputClass}><option value="all">All strategies</option>{Object.entries(rehabStrategyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <input placeholder="Min rehab budget" value={filters.minBudget} onChange={(e) => setFilters((current) => ({ ...current, minBudget: e.target.value }))} className={inputClass} />
                <input placeholder="Max rehab budget" value={filters.maxBudget} onChange={(e) => setFilters((current) => ({ ...current, maxBudget: e.target.value }))} className={inputClass} />
                <input placeholder="Min projected profit" value={filters.minProfit} onChange={(e) => setFilters((current) => ({ ...current, minProfit: e.target.value }))} className={inputClass} />
                <input placeholder="Max projected profit" value={filters.maxProfit} onChange={(e) => setFilters((current) => ({ ...current, maxProfit: e.target.value }))} className={inputClass} />
              </div>
            </div>

            <div className="min-w-0">
              {activeTab === 'projects' ? (
                viewMode === 'cards' ? (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                    {filteredProjects.map(({ project, metrics }) => {
                      const warnings = projectWarnings(project);
                      return (
                        <button key={project.id} type="button" onClick={() => setSelectedProjectId(project.id)} className={`rounded-[24px] border p-4 text-left transition ${selectedProjectId === project.id ? 'border-cyan-400/40 shadow-[0_18px_36px_-28px_rgba(34,211,238,0.35)]' : `${appPanelClass}`}`}>
                          {project.mainImageUrl ? <img src={project.mainImageUrl} alt={project.title} className="h-44 w-full rounded-[20px] object-cover" /> : <div className={`flex h-44 items-center justify-center rounded-[20px] ${appPanelInsetClass}`}><span className={appTextSoftClass}>Main image</span></div>}
                          <div className="mt-4 flex items-start justify-between gap-3"><div><p className={`text-lg font-semibold ${appTextStrongClass}`}>{project.title}</p><p className={`mt-1 text-sm ${appTextMutedClass}`}>{project.address || project.city || 'Location pending'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${appPanelInsetClass} ${appTextMutedClass}`}>{rehabStrategyLabels[project.strategy]}</span></div>
                          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                            <div className={`${appPanelInsetClass} rounded-[18px] p-3`}><p className={appTextSoftClass}>Stage</p><p className={`mt-1 font-semibold ${appTextStrongClass}`}>{rehabStageLabels[project.stage]}</p></div>
                            <div className={`${appPanelInsetClass} rounded-[18px] p-3`}><p className={appTextSoftClass}>Completion</p><p className={`mt-1 font-semibold ${appTextStrongClass}`}>{project.progressPct}%</p></div>
                            <div className={`${appPanelInsetClass} rounded-[18px] p-3`}><p className={appTextSoftClass}>Budgeted rehab</p><p className={`mt-1 font-semibold ${appTextStrongClass}`}>{formatCurrency(metrics.totalBudgetedRehab, settings.currency)}</p></div>
                            <div className={`${appPanelInsetClass} rounded-[18px] p-3`}><p className={appTextSoftClass}>Projected profit</p><p className={`mt-1 font-semibold ${appTextStrongClass}`}>{formatCurrency(metrics.projectedNetProfit, settings.currency)}</p></div>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">{warnings.map((warning) => <span key={warning.label} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${warningTone[warning.tone]}`}>{warning.label}</span>)}</div>
                          <p className={`mt-4 text-xs ${appTextMutedClass}`}>Last updated {formatDate(project.updatedAt)}</p>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-[24px] border">
                    <table className="min-w-full text-left text-sm">
                      <thead className={`${appPanelInsetClass}`}><tr>{['Project', 'Stage', 'Purchase', 'Budgeted', 'Actual', 'Resale', 'Profit', 'Completion'].map((header) => <th key={header} className="px-4 py-3 font-semibold">{header}</th>)}</tr></thead>
                      <tbody>{filteredProjects.map(({ project, metrics }) => <tr key={project.id} className="border-t"><td className="px-4 py-3"><button type="button" onClick={() => setSelectedProjectId(project.id)} className={`font-semibold ${appTextStrongClass}`}>{project.title}</button></td><td className="px-4 py-3">{rehabStageLabels[project.stage]}</td><td className="px-4 py-3">{formatCurrency(project.purchasePrice, settings.currency)}</td><td className="px-4 py-3">{formatCurrency(metrics.totalBudgetedRehab, settings.currency)}</td><td className="px-4 py-3">{formatCurrency(metrics.totalActualRehab, settings.currency)}</td><td className="px-4 py-3">{formatCurrency(project.targetResalePrice, settings.currency)}</td><td className="px-4 py-3">{formatCurrency(metrics.projectedNetProfit, settings.currency)}</td><td className="px-4 py-3">{project.progressPct}%</td></tr>)}</tbody>
                    </table>
                  </div>
                )
              ) : null}
              {selectedProject && selectedMetrics && activeTab !== 'projects' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                    <div className={`${appPanelClass} rounded-[28px] p-5`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>Project Workspace</p>
                          <h2 className={`mt-2 text-[1.85rem] font-semibold ${appTextStrongClass}`}>{selectedProject.title}</h2>
                          <p className={`mt-2 text-sm ${appTextMutedClass}`}>{selectedProject.address || selectedProject.city || 'Location pending'} · {rehabStageLabels[selectedProject.stage]}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setEditingProject(selectedProject)} className={`rounded-xl px-4 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}>Edit project</button>
                          <button type="button" onClick={() => onGenerateReport('rehab', selectedProject.id)} className={`rounded-xl px-4 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}>{t('common.generateInvestmentMemo')}</button>
                          <button type="button" onClick={() => onDeleteProject(selectedProject.id)} className={`rounded-xl px-4 py-2 ${appButtonMutedClass} text-rose-600 dark:text-rose-300`}>Delete</button>
                        </div>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                        {[
                          ['Purchase Price', formatCurrency(selectedProject.purchasePrice, settings.currency)],
                          ['Budgeted Rehab Cost', formatCurrency(selectedMetrics.totalBudgetedRehab, settings.currency)],
                          ['Actual Spend', formatCurrency(selectedMetrics.totalActualRehab, settings.currency)],
                          ['Remaining Budget', formatCurrency(selectedMetrics.remainingBudget, settings.currency)],
                          ['Cash Needed', formatCurrency(selectedMetrics.totalCashNeeded, settings.currency)],
                          ['Projected Profit', formatCurrency(selectedMetrics.projectedNetProfit, settings.currency)],
                          ['Profit Margin %', formatPercentage(selectedMetrics.profitMarginPct)],
                          ['Completion %', `${selectedProject.progressPct}%`],
                        ].map(([label, value]) => <div key={label} className={`${appPanelInsetClass} rounded-[22px] p-4`}><p className={`text-xs font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>{label}</p><p className={`mt-2 text-lg font-semibold ${appTextStrongClass}`}>{value}</p></div>)}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">{projectWarnings(selectedProject).map((warning) => <span key={warning.label} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${warningTone[warning.tone]}`}>{warning.label}</span>)}</div>
                    </div>
                    <div className={`${appPanelClass} rounded-[28px] p-5`}>
                      {selectedProject.mainImageUrl ? <img src={selectedProject.mainImageUrl} alt={selectedProject.title} className="h-[280px] w-full rounded-[24px] object-cover" /> : <div className={`flex h-[280px] items-center justify-center rounded-[24px] ${appPanelInsetClass}`}><span className={appTextSoftClass}>Upload a project hero image</span></div>}
                      <div className="mt-4 space-y-3">
                        <div className={`${appPanelInsetClass} rounded-[20px] p-4`}><p className={`text-xs font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>Health score</p><p className={`mt-2 text-3xl font-semibold ${appTextStrongClass}`}>{selectedProject.healthScore}</p><p className={`mt-2 text-sm ${appTextMutedClass}`}>{selectedProject.healthStatus}</p></div>
                        <div className={`${appPanelInsetClass} rounded-[20px] p-4`}><p className={`text-xs font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>Projected profit always visible</p><p className={`mt-2 text-xl font-semibold ${appTextStrongClass}`}>{formatCurrency(selectedMetrics.projectedNetProfit, settings.currency)}</p><p className={`mt-2 text-sm ${appTextMutedClass}`}>Use this as the main decision anchor while the budget and timeline evolve.</p></div>
                      </div>
                    </div>
                  </div>

                  {activeTab === 'budget' ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
                        {[
                          ['Total project budget', selectedMetrics.totalProjectBudget],
                          ['Total spent so far', selectedMetrics.totalActualRehab],
                          ['Remaining to finish', selectedMetrics.remainingBudget],
                          ['Projected final spend', selectedMetrics.projectedFinalSpend],
                        ].map(([label, value]) => <div key={label} className={`${appPanelClass} rounded-[24px] p-4`}><p className={`text-xs font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>{label}</p><p className={`mt-2 text-xl font-semibold ${appTextStrongClass}`}>{formatCurrency(value as number, settings.currency)}</p></div>)}
                      </div>
                      <div className={`${appPanelClass} rounded-[28px] p-5`}>
                        <div className="flex items-center justify-between gap-3"><h3 className={`text-lg font-semibold ${appTextStrongClass}`}>Budget</h3><button type="button" onClick={() => updateSelectedProject((project) => ({ ...project, budgetLines: [...project.budgetLines, { id: `custom-${Date.now()}`, category: 'Custom', budgeted: 0, actual: 0, notes: '' }] }))} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextMutedClass}`}>Add custom category</button></div>
                        <div className="mt-4 overflow-x-auto">
                          <table className="min-w-full text-left text-sm">
                            <thead><tr className={`border-b ${appBorderClass}`}><th className="py-3 pr-4">Category</th><th className="py-3 pr-4">Budgeted</th><th className="py-3 pr-4">Actual</th><th className="py-3 pr-4">Difference</th><th className="py-3 pr-4">% over / under</th><th className="py-3">Status</th></tr></thead>
                            <tbody>{selectedProject.budgetLines.map((line, index) => { const diff = line.budgeted - line.actual; const pct = line.budgeted === 0 ? 0 : (diff / line.budgeted) * 100; const status = diff < 0 ? 'Over budget' : diff < line.budgeted * 0.1 ? 'Close to limit' : 'On track'; const tone = diff < 0 ? warningTone.risk : diff < line.budgeted * 0.1 ? warningTone.watch : warningTone.good; return <tr key={line.id} className="border-b border-slate-200/50 dark:border-slate-800/80"><td className="py-3 pr-4"><input value={line.category} onChange={(e) => updateSelectedProject((project) => ({ ...project, budgetLines: project.budgetLines.map((item, itemIndex) => itemIndex === index ? { ...item, category: e.target.value } : item) }))} className={inputClass} /></td><td className="py-3 pr-4"><input type="number" value={line.budgeted} onChange={(e) => updateSelectedProject((project) => ({ ...project, budgetLines: project.budgetLines.map((item, itemIndex) => itemIndex === index ? { ...item, budgeted: Number(e.target.value || 0) } : item) }))} className={inputClass} /></td><td className="py-3 pr-4"><input type="number" value={line.actual} onChange={(e) => updateSelectedProject((project) => ({ ...project, budgetLines: project.budgetLines.map((item, itemIndex) => itemIndex === index ? { ...item, actual: Number(e.target.value || 0) } : item) }))} className={inputClass} /></td><td className="py-3 pr-4">{formatCurrency(diff, settings.currency)}</td><td className="py-3 pr-4">{formatPercentage(pct)}</td><td className="py-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{status}</span></td></tr>; })}</tbody>
                          </table>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
                          <div className={`${appPanelInsetClass} rounded-[20px] p-4`}><p className={appTextSoftClass}>Contingency used</p><p className={`mt-2 font-semibold ${appTextStrongClass}`}>{formatCurrency(selectedMetrics.contingencyUsed, settings.currency)}</p></div>
                          <div className={`${appPanelInsetClass} rounded-[20px] p-4`}><p className={appTextSoftClass}>Remaining contingency</p><p className={`mt-2 font-semibold ${appTextStrongClass}`}>{formatCurrency(selectedMetrics.remainingContingency, settings.currency)}</p></div>
                          <div className={`${appPanelInsetClass} rounded-[20px] p-4`}><p className={appTextSoftClass}>Remaining budget</p><p className={`mt-2 font-semibold ${appTextStrongClass}`}>{formatCurrency(selectedMetrics.remainingBudget, settings.currency)}</p></div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {activeTab === 'timeline' ? (
                    <div className={`${appPanelClass} rounded-[28px] p-5`}>
                      <h3 className={`text-lg font-semibold ${appTextStrongClass}`}>Timeline</h3>
                      <div className="mt-4 space-y-3">{selectedProject.timelinePhases.map((phase, index) => <div key={phase.id} className={`${appPanelInsetClass} rounded-[22px] p-4`}><div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_160px_160px_120px_100px]"><input value={phase.title} onChange={(e) => updateSelectedProject((project) => ({ ...project, timelinePhases: project.timelinePhases.map((item, itemIndex) => itemIndex === index ? { ...item, title: e.target.value } : item) }))} className={inputClass} /><input type="date" value={phase.plannedStartDate} onChange={(e) => updateSelectedProject((project) => ({ ...project, timelinePhases: project.timelinePhases.map((item, itemIndex) => itemIndex === index ? { ...item, plannedStartDate: e.target.value } : item) }))} className={inputClass} /><input type="date" value={phase.plannedEndDate} onChange={(e) => updateSelectedProject((project) => ({ ...project, timelinePhases: project.timelinePhases.map((item, itemIndex) => itemIndex === index ? { ...item, plannedEndDate: e.target.value } : item) }))} className={inputClass} /><input type="number" value={phase.progressPct} onChange={(e) => updateSelectedProject((project) => ({ ...project, timelinePhases: project.timelinePhases.map((item, itemIndex) => itemIndex === index ? { ...item, progressPct: Number(e.target.value || 0), status: Number(e.target.value || 0) >= 100 ? 'completed' : item.status } : item) }))} className={inputClass} /><button type="button" onClick={() => updateSelectedProject((project) => ({ ...project, timelinePhases: project.timelinePhases.map((item, itemIndex) => itemIndex === index ? { ...item, progressPct: 100, status: 'completed', actualEndDate: new Date().toISOString().slice(0, 10) } : item) }))} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextMutedClass}`}>Complete</button></div></div>)}</div>
                      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3"><div className={`${appPanelInsetClass} rounded-[20px] p-4`}><p className={appTextSoftClass}>Estimated days delayed</p><p className={`mt-2 font-semibold ${appTextStrongClass}`}>{selectedMetrics.scheduleDelayDays}</p></div><div className={`${appPanelInsetClass} rounded-[20px] p-4`}><p className={appTextSoftClass}>Total project delay</p><p className={`mt-2 font-semibold ${appTextStrongClass}`}>{selectedMetrics.scheduleDelayDays} days</p></div><div className={`${appPanelInsetClass} rounded-[20px] p-4`}><p className={appTextSoftClass}>Completion</p><p className={`mt-2 font-semibold ${appTextStrongClass}`}>{selectedProject.progressPct}%</p></div></div>
                    </div>
                  ) : null}

                  {activeTab === 'tasks' ? (
                    <div className={`${appPanelClass} rounded-[28px] p-5`}>
                      <div className="flex items-center justify-between gap-3"><h3 className={`text-lg font-semibold ${appTextStrongClass}`}>Tasks</h3><button type="button" onClick={addTask} className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextMutedClass}`}>Add task</button></div>
                      <div className="mt-4 space-y-3">{selectedProject.tasks.map((task, index) => <div key={task.id} className={`${appPanelInsetClass} rounded-[22px] p-4`}><div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.4fr)_140px_140px_140px]"><input value={task.title} onChange={(e) => updateSelectedProject((project) => ({ ...project, tasks: project.tasks.map((item, itemIndex) => itemIndex === index ? { ...item, title: e.target.value } : item) }))} className={inputClass} /><select value={task.status} onChange={(e) => updateSelectedProject((project) => ({ ...project, tasks: project.tasks.map((item, itemIndex) => itemIndex === index ? { ...item, status: e.target.value as RehabTask['status'] } : item) }))} className={inputClass}><option value="to-do">To do</option><option value="in-progress">In progress</option><option value="waiting">Waiting</option><option value="completed">Completed</option></select><select value={task.priority} onChange={(e) => updateSelectedProject((project) => ({ ...project, tasks: project.tasks.map((item, itemIndex) => itemIndex === index ? { ...item, priority: e.target.value as RehabTask['priority'] } : item) }))} className={inputClass}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><input type="date" value={task.dueDate} onChange={(e) => updateSelectedProject((project) => ({ ...project, tasks: project.tasks.map((item, itemIndex) => itemIndex === index ? { ...item, dueDate: e.target.value } : item) }))} className={inputClass} /></div></div>)}</div>
                    </div>
                  ) : null}

                  {activeTab === 'documents' ? (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <div className={`${appPanelClass} rounded-[28px] p-5`}>
                        <div className="flex items-center gap-2"><Camera className="h-4 w-4 text-cyan-500" /><h3 className={`text-lg font-semibold ${appTextStrongClass}`}>Photo progress log</h3></div>
                        <div className="mt-4 flex flex-wrap gap-2"><label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextMutedClass}`}><Upload className="h-4 w-4" />Upload photos<input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void uploadFiles(e.target.files, 'photo')} /></label></div>
                        <div className="mt-4 grid grid-cols-2 gap-3">{selectedProject.galleryImages.map((image) => <div key={image.id} className="overflow-hidden rounded-[20px]"><img src={image.url} alt={image.name} className="h-36 w-full object-cover" /></div>)}</div>
                      </div>
                      <div className={`${appPanelClass} rounded-[28px] p-5`}>
                        <div className="flex items-center gap-2"><Receipt className="h-4 w-4 text-cyan-500" /><h3 className={`text-lg font-semibold ${appTextStrongClass}`}>Invoices and documents</h3></div>
                        <div className="mt-4 flex flex-wrap gap-2"><label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextMutedClass}`}><Upload className="h-4 w-4" />Upload files<input type="file" multiple className="hidden" onChange={(e) => void uploadFiles(e.target.files, 'other')} /></label></div>
                        <div className="mt-4 space-y-3">{selectedProject.documents.map((doc) => <div key={doc.id} className={`${appPanelInsetClass} flex items-center justify-between rounded-[20px] p-4`}><div><p className={`text-sm font-semibold ${appTextStrongClass}`}>{doc.name}</p><p className={`mt-1 text-xs ${appTextMutedClass}`}>{doc.type}</p></div><a href={doc.url} target="_blank" rel="noreferrer" className={`rounded-xl px-3 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}>Open</a></div>)}</div>
                      </div>
                    </div>
                  ) : null}

                  {activeTab === 'analysis' ? (
                    <div className="space-y-4">
                      <div className="flex gap-2">{(Object.keys(rehabScenarioLabels) as RehabScenario[]).map((item) => <button key={item} type="button" onClick={() => setScenario(item)} className={`rounded-full px-3.5 py-2 text-sm font-medium ${scenario === item ? 'border border-cyan-400/28 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : `${appButtonMutedClass} ${appTextMutedClass}`}`}>{rehabScenarioLabels[item]}</button>)}</div>
                      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">{[
                        ['Total Cash Needed', selectedMetrics.totalCashNeeded],
                        ['Total Project Cost', selectedMetrics.totalProjectCost],
                        ['Remaining Cash Needed', selectedMetrics.remainingCashNeeded],
                        ['Projected Gross Profit', selectedMetrics.projectedGrossProfit],
                        ['Projected Net Profit', selectedMetrics.projectedNetProfit],
                        ['Profit Margin %', selectedMetrics.profitMarginPct],
                        ['ROI', selectedMetrics.roiPct],
                        ['Break-even Sale Price', selectedMetrics.breakEvenSalePrice],
                        ['Rental fallback net', selectedMetrics.rentalFallbackNetCashflow],
                        ['Rental fallback CoC', selectedMetrics.rentalFallbackCashOnCash],
                      ].map(([label, value]) => <div key={label as string} className={`${appPanelClass} rounded-[24px] p-4`}><p className={`text-xs font-semibold uppercase tracking-[0.14em] ${appTextSoftClass}`}>{label}</p><p className={`mt-2 text-lg font-semibold ${appTextStrongClass}`}>{(((label as string).toLowerCase().includes('%')) || label === 'ROI' || label === 'Rental fallback CoC') ? formatPercentage(value as number) : formatCurrency(value as number, settings.currency)}</p></div>)}</div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}

      {editingProject ? <ProjectEditor project={editingProject} opportunities={opportunities} properties={properties} onChange={(project) => { setEditingProject(project); onUpdateProject(project); }} onClose={() => setEditingProject(null)} /> : null}
    </div>
  );
};
