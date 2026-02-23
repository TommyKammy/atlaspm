'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ProjectBoard from '@/components/project-board';
import { api, getToken } from '@/lib/api';

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [project, setProject] = useState<any>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [newSection, setNewSection] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [taskSectionId, setTaskSectionId] = useState('');

  const token = getToken();

  const load = async () => {
    const projects = await api('/projects', { token });
    setProject(projects.find((p: any) => p.id === projectId));
    const sec = await api(`/projects/${projectId}/sections`, { token });
    setSections(sec);
    if (!taskSectionId && sec.length && sec[0]) setTaskSectionId(sec[0].id);
  };

  useEffect(() => {
    if (!projectId) return;
    void load();
  }, [projectId]);

  if (!projectId) return <div>Loading...</div>;

  const createSection = async () => {
    await api(`/projects/${projectId}/sections`, { method: 'POST', token, body: { name: newSection } });
    setNewSection('');
    await load();
  };

  const createTask = async () => {
    await api(`/projects/${projectId}/tasks`, {
      method: 'POST',
      token,
      body: { title: newTaskTitle, sectionId: taskSectionId },
    });
    setNewTaskTitle('');
    await load();
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{project?.name ?? 'Project'}</h1>
        <Link className="text-blue-700 underline" href={`/projects/${projectId}/rules`}>
          Rules Page
        </Link>
      </header>

      <div className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="font-semibold">Create Section</h2>
          <input className="w-full rounded border p-2" value={newSection} onChange={(e) => setNewSection(e.target.value)} />
          <button className="rounded bg-slate-900 px-3 py-2 text-white" onClick={createSection} data-testid="create-section-btn">
            Add Section
          </button>
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold">Create Task</h2>
          <input className="w-full rounded border p-2" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} />
          <select className="w-full rounded border p-2" value={taskSectionId} onChange={(e) => setTaskSectionId(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button className="rounded bg-slate-900 px-3 py-2 text-white" onClick={createTask} data-testid="create-task-btn">
            Add Task
          </button>
        </div>
      </div>

      <ProjectBoard projectId={projectId} />
    </div>
  );
}
