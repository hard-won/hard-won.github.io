/**
 * Project entries render as cards on /projects and, once any entry reaches
 * status 'shipped', on the homepage under Selected Work.
 *
 * To add a real project, append an entry with status 'shipped' (or 'active')
 * and fill in `links`. Do not list anything that does not exist yet as
 * anything other than 'in design'.
 */
export type ProjectStatus = 'in design' | 'active' | 'shipped';

export interface Project {
  title: string;
  summary: string;
  status: ProjectStatus;
  topics: string[];
  links?: Array<{ label: string; href: string }>;
}

export const projects: Project[] = [
  {
    title: 'Workload characterization for AI data movement',
    summary:
      'Turning real model execution into a traffic description: what is read, what is written, how often, and from where. The goal is a reusable trace/summary format that later modeling work can consume directly.',
    status: 'in design',
    topics: ['workload analysis', 'traces', 'data movement'],
  },
  {
    title: 'Memory system and HBM modeling',
    summary:
      'A parameterized model of bandwidth, latency and bank-level behaviour under those workload traces, to test how much of an accelerator stall is really a memory-system property.',
    status: 'in design',
    topics: ['memory systems', 'HBM', 'performance modeling'],
  },
  {
    title: 'NoC / interconnect simulation',
    summary:
      'Topology, routing and flow-control experiments driven by the same traffic, rather than by synthetic uniform-random patterns, so the results say something about the workload that motivated them.',
    status: 'in design',
    topics: ['NoC', 'interconnect', 'simulation'],
  },
  {
    title: 'RTL network datapath',
    summary:
      'A synthesizable datapath block taking one of the above results from model to hardware, with its own testbench, so the modeling work terminates in something implementable.',
    status: 'in design',
    topics: ['RTL', 'SystemVerilog', 'verification'],
  },
];
