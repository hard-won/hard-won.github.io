/**
 * The link list that used to be the `Resources` post.
 *
 * It was never a note — eighty characters of prose and twelve links — so it is
 * a page rather than an entry in /reading. Titles are the author's original
 * Chinese, translated; where the target publishes its own title, that title is
 * used instead of a translation. `starred` preserves the one entry the original
 * singled out with an asterisk.
 */
export interface LinkEntry {
  title: string;
  url: string;
  starred?: boolean;
}

export interface LinkGroup {
  /** English section label, in the site's mono idiom. */
  label: string;
  links: LinkEntry[];
}

export const LINK_GROUPS: LinkGroup[] = [
  {
    label: 'DIGITAL IC — GROUNDWORK',
    links: [
      {
        title: 'What a competent digital IC designer needs to know',
        url: 'https://bbs.eetop.cn/thread-867538-1-1.html',
      },
      { title: 'The digital IC design flow', url: 'https://bbs.eetop.cn/thread-926082-1-1.html' },
      {
        title: 'Digital IC special interest group',
        url: 'https://www.zhihu.com/column/c_1029044037684183040',
      },
      { title: 'How to read a timing diagram', url: 'https://www.cnblogs.com/manlujun/p/16059964.html' },
      {
        title: 'Delay Modeling and Static Timing Verification',
        url: 'https://people.eecs.berkeley.edu/~keutzer/classes/244fa2005/lectures/2-timing.pdf',
      },
      { title: 'Learning the AMBA bus', url: 'https://www.zhihu.com/column/c_1663245806869291008' },
    ],
  },
  {
    label: 'PCIE',
    links: [
      {
        title: 'PCIe you could study for ten thousand hours',
        url: 'https://www.zhihu.com/tardis/zm/art/447134701?source_id=1003',
        starred: true,
      },
      { title: 'PCIe Spec', url: 'https://pcisig.com/specifications/pciexpress/' },
      {
        title: 'PCIe hardware implementation architecture',
        url: 'https://blog.csdn.net/qq_39815222/article/details/128728334',
      },
      { title: 'PCIe primer series', url: 'http://blog.chinaaet.com/justlxy/p/5100053251' },
      {
        title: "A Politecnico di Torino master's thesis on the PHY interface for PCIe",
        url: 'https://webthesis.biblio.polito.it/21031/1/tesi.pdf',
      },
      { title: 'Verilog PCIe Components', url: 'https://alexforencich.com/wiki/en/verilog/pcie/start' },
    ],
  },
];

export const LINK_COUNT = LINK_GROUPS.reduce((n, group) => n + group.links.length, 0);

/** `https://bbs.eetop.cn/thread-…` -> `bbs.eetop.cn`, for the row's mono tag. */
export function host(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}
