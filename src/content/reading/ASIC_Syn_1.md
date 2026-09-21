---
title: "速读ASIC综合（一）"
date: 2022-01-01T00:00:00-08:00
displayDate: "2022-01-01"
slug: "ASIC_Syn_1"
lang: zh
category: "rtl"
tags: []
originalUrl: "/2022/01/01/ASIC_Syn_1/"
---
# ASIC Synthesis前言

后面要找工作，上完课没事干就多看看书吧。这个系列是为了速读ASIC Synthesis的整体流程，完整的ASIC设计流程。从概念到芯片的tapout。并且也基于Design Compiler提供了各种真实工作会用到的实践而非理论。书一共六章。纸上得来终觉浅，hands on很宝贵。

# 第一章 你该怎么设计一款ASIC

![image-20240325220534218](/2022/01/01/ASIC_Syn_1/image-20240325220534218.png)

1.  写规范和结构，architect的任务
2.  RTL编码
3.  有些设计有memory，需要插入DFT memory BIST
4.  verification
5.  工艺库等环境设置
6.  用Design Compiler对具有扫描插入（和可选择的JTAG）设计进行约束和综合设计
7.  用DC进行module level的STA
8.  formal verification，对比RTL和Netlist
9.  用PrimeTime进行system level的STA
10.  对layout工具进行时序约束前的标注
11.  全局布线的初始layout划分
12.  时钟树转Netlist
13.  用DC做设计的layout optimization
14.  在Netlist和clk tree插入的Netlist之间用Formality进行formal verification
15.  全局布线后（第11步）从layout提取估计的delay
16.  得到estimated delay 反标注到PrimeTime
17.  使用estimated delay进行STA
18.  design的详细布局
19.  extract 详细布局设计的实际delay
20.  实际delay反标注到PrimeTime
21.  使用真实的delay进行STA
22.  gate level 的功能仿真（optional）
23.  LVS和DRC之后就tape out了

设计就是三种：behavioral，RTL，structural。行为级就是想实现什么就写什么。RTL是会转换成Netlist，所以写RTL不如说是在画logic module的连接图，心里一定要有数字设计图。

然后就是动态simulation，检查设计的功能。现在的simulator都能仿真behavioral和RTL的了，有时也会仿真映射后gate level的设计。RTL的仿真不考虑元件或门的时序，所以为了最小化RTL仿真和综合后gate level的仿真之间的差异，通常在具有时序单元的RTL coding时就加入delay。

以前人们都是手工将HDL画成逻辑电路图，现在都是用synthesis工具。Synthesis是一个反复迭代的过程，先为设计中每个模块定义时序constraint（规定了每个信号和特定module的clk input的联系）。除了constraint，还要定义synthesis环境的文件，这个文件说明了工艺library和DC在使用中的相关信息。

DC应用时序constraint读取RTL code后，synthesis到structural level，从而产生一个映射后的gate level netlist。一般小模块的设计，DC有内置的STA工具。如果不满足再需要继续优化。

目前设计都会结合DFT的逻辑，以便测试。可测性设计。

formal verification是用数学方法来确认一个设计，不考虑工艺因素（时序或物理效应）。用来跟设计对比来检查逻辑。与simulation不同，formal是要证明两个设计的结构和功能是逻辑等价的；simulation是只能检查敏感路径，所以不可能找到其他出现的问题。formal verification很快很快，相比simulation。

formal verification就是验证RTL和RTL，netlist和RTL之间的关系。可能会增加附加性能，要经常修改设计，当特性增加到RTL上时，可能会改变正确的逻辑功能。还有在RTL和有扫描插入的门级之间，为了保证门级也有一样的功能。如果用simulation，太久（数天数星期），formal verification只需要几小时。还有门级和门级的，也就是layout输入和输出的，中间后插入clk tree的netlist，也是一种修改，所以要验证逻辑是否等价。

STA可以详细分析报告所有critical path也包含fanout或每个线网的容性负载。对layout前后的gate level netlist进行STA。layout前，用PrimeTime由工艺library指定的线载模型estimate线网delay，这个过程中先前输入到DC的时序constraint也输入到PrimeTime中并详细说明input output和clk的关系。如果对于所有critical path是可接受的，则可以得到一个constraint文件（.SDF），预标注到layout工具，这个文件详细描述了layout工具使用的每个逻辑组之间的时序。

layout后，实际extract的delay被反标注到PrimeTime用来提供真实的delay计算，这些delay都是连线电容和互连RC的delay。

STA也是一个反复迭代的过程，和placement和routing联系很紧密，需要搞很多次，累。

floorplan和layout质量比实际的布线更重要。好的floorplan，不但能加速最终的布线，而且也能更好的满足timing constraint并且减少blocking。constraint文件用来进行时序驱动布局。时序驱动布局方法可以让layout工具根据unit之间的timing关键程度放置unit。

在unit layout后，clk tree通过layout工具插入设计。CT的插入是可以选择的，依赖于设计需求和用户偏爱。用户可以选择传统的方法比如，为了减少总时间delay和clk skew使用fishbone/spine结构的clk网络。当工艺尺寸缩小，互连线电阻的增加（RC delay增加），spine方法实现变得困难。我把重点放在clk tree synthesis方法。

---

---

---

---

---

---

---
