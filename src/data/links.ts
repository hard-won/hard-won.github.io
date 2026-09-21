/**
 * The link list that used to be the `Resources` post.
 *
 * It was never a note — eighty characters of prose and twelve links — so it is
 * a page rather than an entry in /reading. Titles are the author's original
 * Chinese and are translated in a later pass; `starred` preserves the one entry
 * the original singled out with an asterisk.
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
        title: '一个合格数字IC设计师的知识结构',
        url: 'https://bbs.eetop.cn/thread-867538-1-1.html',
      },
      { title: '数字IC设计流程', url: 'https://bbs.eetop.cn/thread-926082-1-1.html' },
      {
        title: '数字IC特别兴趣小组',
        url: 'https://www.zhihu.com/column/c_1029044037684183040',
      },
      { title: '如何读懂时序图', url: 'https://www.cnblogs.com/manlujun/p/16059964.html' },
      {
        title: '延时建模和静态时序验证',
        url: 'https://people.eecs.berkeley.edu/~keutzer/classes/244fa2005/lectures/2-timing.pdf',
      },
      { title: 'AMBA总线学习', url: 'https://www.zhihu.com/column/c_1663245806869291008' },
    ],
  },
  {
    label: 'PCIE',
    links: [
      {
        title: '可以学习1W小时的PCIe',
        url: 'https://www.zhihu.com/tardis/zm/art/447134701?source_id=1003',
        starred: true,
      },
      { title: 'PCIe Spec', url: 'https://pcisig.com/specifications/pciexpress/' },
      {
        title: 'PCIe硬件实现架构',
        url: 'https://blog.csdn.net/qq_39815222/article/details/128728334',
      },
      { title: 'PCIe扫盲系列', url: 'http://blog.chinaaet.com/justlxy/p/5100053251' },
      {
        title: '多伦多大学的一篇master论文，PHY Interface for PCIe',
        url: 'https://webthesis.biblio.polito.it/21031/1/tesi.pdf',
      },
      { title: 'PCIe的Verilog实现', url: 'https://alexforencich.com/wiki/en/verilog/pcie/start' },
    ],
  },
];

export const LINK_COUNT = LINK_GROUPS.reduce((n, group) => n + group.links.length, 0);

/** `https://bbs.eetop.cn/thread-…` -> `bbs.eetop.cn`, for the row's mono tag. */
export function host(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}
