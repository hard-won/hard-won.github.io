/**
 * Project entries render as numbered rows in the datasheet listing on
 * /projects, under either WORK or PLANNED DIRECTIONS depending on status.
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
    summary: 'What a real model execution reads and writes, how often, and from where — in a trace format the modeling work below can consume directly.',
    status: 'in design',
    topics: ['workload analysis', 'traces', 'data movement'],
  },
  {
    title: 'Memory system and HBM modeling',
    summary: 'Bandwidth, latency and bank-level behaviour under those traces. How much of an accelerator stall is actually a memory-system property?',
    status: 'in design',
    topics: ['memory systems', 'HBM', 'performance modeling'],
  },
  {
    title: 'NoC / interconnect simulation',
    summary: 'Topology, routing and flow control driven by the same traffic instead of synthetic uniform-random.',
    status: 'in design',
    topics: ['NoC', 'interconnect', 'simulation'],
  },
  {
    title: 'RTL network datapath',
    summary: 'A synthesizable block with its own testbench, taking one of the results above from model to hardware.',
    status: 'in design',
    topics: ['RTL', 'SystemVerilog', 'verification'],
  },
];
