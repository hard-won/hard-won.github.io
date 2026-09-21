---
title: "高速接口PCIe无痛入门（三）数据链路层"
date: 2024-04-14T19:20:18-07:00
displayDate: "2024-04-14"
slug: "PCIe-3"
lang: zh
category: "interconnect"
tags: []
source:
  title: "PCI Express Base Specification"
  url: "https://pcisig.com/specifications/pciexpress/"
furtherReading:
  - title: "OSDev Wiki — PCI"
    url: "https://wiki.osdev.org/PCI"
  - title: "MindShare — An Introduction to PCI Express"
    url: "https://www.mindshare.com/files/resources/MindShare_Intro_to_PCIe.pdf"
  - title: "Wikipedia — PCI Express"
    url: "https://en.wikipedia.org/wiki/PCI_Express"
originalUrl: "/2024/04/14/PCIe-3/"
---
# 数据链路层 Data Link Layer

数据链路层负责：**保证transaction消息能够正确传输到目的地**。

在数据链路层（Data Link Layer）的传输过程中，包（Packet）分为两大类：事务层包（Transaction Layer Packet, **TLP**）和数据链路层包（Data Link Layer Packet, **DLLP**）。这两种包各自承担不同的职责，并通过物理层PHY的标记来区分。

![DLL](/2024/04/14/PCIe-3/DLL.png)

这幅图展示了PCI Express (PCIe) 数据链路层的基本传输和接收流程。左侧的蓝色部分代表发送方（Tx），右侧的蓝色部分代表接收方（Rx），两者通过中间的链路相连。下面是对图中各个部分的详细解释：

1.  **发送方（Tx）**：
    -   **来自事务层**：数据包（TLP）从事务层发送到数据链路层。
    -   **Link Packet**：表示数据链路层对TLP包的封装，其中包括序列号和LCRC（Link CRC）校验码。
    -   **Replay Buffer**：重发缓冲区，用于存储发送出去的数据包，以便在需要时可以重新发送。
    -   **Mux（Multiplexer）**：复用器，用于在数据链路层管理数据流和控制流（如DLLP ACK/NAK消息）。
2.  **链路**：
    -   **Tx到Rx**：数据包通过物理链路从发送端传输到接收端。
3.  **接收方（Rx）**：
    -   **De-mux（Demultiplexer）**：解复用器，用于在接收端分离数据流和控制流。
    -   **Error Check**：错误检测，接收端检查序列号和LCRC来验证数据包是否完整无误。
    -   **Link Packet**：表示接收到的数据包。如果出现错误（如序列号或CRC错误），这些错误会被标记出来（如图中的红叉）。
4.  **DLLP ACK/NAK**：
    -   **ACK**：如果数据包无误，接收方会发送一个确认消息（ACK），通知发送方数据已成功接收。
    -   **NAK**：如果检测到错误，接收方会发送一个否认消息（NAK），请求发送方重发数据包。

此图中的红色部分表示接收方检测到一个错误的数据包，因此不接受它，可能会发送一个NAK消息给发送方，请求重新发送。同时，发送方在发送数据包时，会先将其存储在重发缓冲区中，以备不时之需。这整个流程保障了数据的可靠传输，在发现错误时能够及时纠正。

![Data\_Link\_layer](/2024/04/14/PCIe-3/Data_Link_layer.png)

1.  **事务层包（TLP）**：
    -   **用途**：TLP主要用于传输应用数据和执行事务，如读写内存操作。
    -   **标记**：TLP的起始标记为STP（Start of TLP），这个Token用来指示一个TLP消息的开始。
2.  **数据链路层包（DLLP）**：
    -   **用途**：DLLP则主要用于在数据链路层之间传输控制信息，例如功能控制（Feature Control）、流量控制（Flow Control）和电源管理（Power Management）等。这些包用于管理和控制数据链路层的行为和状态，而不是直接传输用户数据。
    -   **标记**：DLLP的起始标记为SDP（Start of DLLP），这个Token用来指示一个控制消息的开始。

通过这种方式，PHY可以识别传入的包是属于哪一类型，从而正确地处理数据或控制信息的传输。这种区分机制确保了数据传输的效率和链路控制的准确性。

![pcie-data-link-layer-layout](/2024/04/14/PCIe-3/pcie-data-link-layer-layout.png)

## TLP Transaction消息的传输

### Data Package格式和数据发送

Data Link Layer会对数据包再进行一层封装，这个过程涉及到添加序列号和CRC校验码。

1.  **序列号（Sequence Number）**：
    -   **大小和作用**：序列号占用2个字节，其主要目的是确保数据包能够按照发送的顺序被接收。这对于处理数据包的顺序性和完整性极其重要，尤其是在高速数据传输中，包的顺序可能会因为多种原因（如并行处理或网络拥堵）而被打乱。
    -   **独立性**：每个链路（Link）都有独立的序列号。这意味着链路两端的设备（发送端和接收端）各自维护一个序列号计数器。接收端设备会记录下一个期望接收的序列号（NEXT\_RCV\_SEQ），只有当接收到的数据包序列号与这个期望值一致时，数据包才会被正式接收。
2.  **链路CRC（LCRC，Link CRC）**：
    -   **大小和作用**：LCRC占用4个字节，它是一种校验码，用来验证数据包在传输过程中的数据完整性和正确性。通过这种方式，可以检测到数据在传输过程中可能发生的任何错误或损坏。
    -   **计算范围**：计算LCRC时，包中已经添加的序列号也会被包括在内。这是因为序列号的任何错误或篡改都可能影响数据包的接收顺序，从而对数据传输的可靠性造成影响。

![pcie-data-link-layer-tlp-packet](/2024/04/14/PCIe-3/pcie-data-link-layer-tlp-packet.png)

数据链路层在处理数据包发送的过程中，采用了一套精心设计的机制来确保数据的可靠传输，涉及到重试缓冲区（Retry Buffer）的使用以及与接收方进行交互确认。这个过程可以分为以下几个步骤：

1.  **使用重试缓冲区（Retry Buffer）**：
    -   **作用**：当数据链路层封装完数据包后，这些包会先被存储在一个叫做Retry Buffer的临时存储空间中。这个缓冲区的主要作用是在发送过程中保存已发送的数据包副本，以备不时之需，即如果需要重发时可以立即使用。
    -   **原因**：这种预备措施是为了应对可能出现的传输错误，确保数据可以在出现问题时重新发送，而不需要重新从源头生成数据包。
2.  **数据传输至物理层（Physical Layer）**：
    -   **流程**：数据包从Retry Buffer送往物理层进行发送。物理层PHY负责将数据电子化并通过物理介质（如电缆、光纤等）发送出去。
3.  **等待确认（ACK）**：
    -   **确认过程**：每当一个或多个数据包被发送后，发送方将暂停发送新的数据包，等待接收方的确认消息。这个确认消息通常是一个称为ACK（Acknowledgment）的信号，表明数据已成功接收。
4.  **处理失败消息**：
    -   **错误类型**：如果接收到的是失败消息，这可能是因为序列号错误、CRC校验失败或物理层发生的其他错误。
    -   **重发机制**：在收到失败消息时，发送方会从Retry Buffer中取出之前保存的数据包，并重新发送它们。这确保了即使在传输错误发生的情况下，数据也能最终被正确传送至接收方。

### 数据接收

对于数据链路层的接收方来说，其处理接收到的数据包的流程确实与发送方相反，主要包括检查数据包的序列号和CRC校验码，以及相应地发送确认消息（Ack）或否认消息（Nak）。

1.  **接收数据包**：
    -   **初步处理**：接收方首先从物理层接收到数据包，并进行初步的解封装，例如去除物理层可能添加的任何标记或头部信息。
2.  **检查序列号**：
    -   **序列号验证**：接收方检查数据包的序列号是否符合预期。每个接收方都会跟踪下一个期望接收的序列号（NEXT\_RCV\_SEQ）。如果接收到的数据包序列号与此不匹配，说明包的顺序出现了问题，可能是丢包或者包顺序错乱。
3.  **进行CRC校验**：
    -   **完整性验证**：接收方计算接收到的数据包（包括数据和序列号）的CRC，并与包中附带的LCRC（Link CRC）进行比对。CRC校验用来确保数据在传输过程中未被损坏或篡改。
4.  **发送响应消息**：
    -   **Nak消息**：如果序列号不正确或CRC校验失败，接收方会发送一个Nak消息给发送方。Nak消息表明接收到的数据包有误，需要发送方重新发送。
    -   **Ack消息**：如果序列号和CRC校验都正确，接收方则发送一个Ack消息，表示数据包已成功接收。
5.  **发送方处理响应**：
    -   **移除Retry Buffer中的数据包**：一旦发送方收到Ack消息，它会从其Retry Buffer中移除相应的数据包，因为这意味着数据包已经被成功接收且不再需要重发。
    -   **重传请求**：如果发送方收到Nak消息，它则需要从Retry Buffer中找到相应的数据包并进行重传。

更加具体的数据接收处理流程：

![pcie-data-link-layer-tlp-receive](/2024/04/14/PCIe-3/pcie-data-link-layer-tlp-receive.png)

## 控制消息 DLLP

**数据链路层数据包（DLLP）**：

-   **DLLP Type**：DLLP类型，标识这是一个控制数据包，并且包含了具体的控制信息类型，比如ACK或NAK。
-   **Misc.**：杂项，这里可以包含不同的控制信息，具体依赖于DLLP的类型。
-   **CRC**：循环冗余校验码，仅针对DLLP数据包内容的校验码，保证了DLLP在传输过程中的数据完整性。

![DLLP](/2024/04/14/PCIe-3/DLLP.png)

Data Link Layer Packet

![pcie-data-link-layer-dllp](/2024/04/14/PCIe-3/pcie-data-link-layer-dllp.png)

DLLP中DLLP Type用来指定包的类型，最后16位的CRC用来做校验，其主要分为以下几种类型：

| 名称 | Type | 描述 |
| --- | --- | --- |
| Ack | 00000000b | 用于确认接收到的TLP数据包 |
| Nak | 00010000 | 用于拒绝接收到的TLP数据包 |
| <InitFC1/InitFC2/UpdateFC>-<P/NP/Cpl> | (Type较多，后面说) | 用于流量控制, P/NP/Cpl表示流量控制类型 |
| MRInitFC1/MRInitFC2/MRUpdateFC | <0111/1111/1011>0xxxb | 用于流量控制, P/NP/Cpl表示流量控制类型 |
| PM\_\* | 00100xxxb | 用于电源管理, 全和或抽样型的电源状态 |
| NOP | 00110001b | 用于保持链路活跃, 防止链路超时关闭 |
| Data\_Link\_Feature | 00000010b | 用于告知对端当前链路的特性, 如支持Scaled Flow Control |
| Vendor-specific | 00110000b | 用于支持厂商自定义的DLLP, 实现厂商特有功能 |

### Ack/Nak

一个Non-Posted传输中，Ack/Nak的执行过程如下图所示：

![ack:nak](/2024/04/14/PCIe-3/ack:nak.png)

之前在TLP事务消息传输里提到过Ack和Nak，它们是DLLP中最常用的消息。两个包的格式如下：

![pcie-data-link-layer-ack-nak](/2024/04/14/PCIe-3/pcie-data-link-layer-ack-nak.png)

`AckNak_Seq_Num` 是数据链路层协议中的一个重要概念，它用于指示已经成功接收的数据包的序列号。Ack（确认）和Nak（否认）机制确保了数据的正确传输，同时提供了类似于TCP协议的流量控制功能。

1.  **AckNak\_Seq\_Num**：
    -   **定义**：AckNak\_Seq\_Num指的是接收方已经成功接收并处理的最新消息的序列号。
    -   **作用**：它告诉发送方，所有序列号小于或等于此序列号的数据包都已被成功接收。
2.  **Ack和Nak的批量操作**：
    -   **批量确认**：由于`AckNak_Seq_Num`表示最新的消息序号，发送方在收到Ack消息后，就可以放心地将Retry Buffer中序列号小于或等于这个序列号的所有消息移除。
    -   **批量否认**：而如果接收到的是Nak消息，则发送方知道至少有一个包（具体是AckNak\_Seq\_Num所指的包）未被正确接收。发送方需要移除Retry Buffer中比这个序列号老的消息，并将这个序列号以及之后的所有消息重新发送。
3.  **Ack与Nak的区别**：
    -   **确认与否认**：Ack消息是一个积极的信号，表示数据包已被正确接收；而Nak消息则是一个负面信号，提示发送方有一个或多个数据包需要重传。
    -   **重传机制**：收到Nak之后，发送方会重新发送指定序列号之后的所有数据包。
4.  **DLLP的重传次数限制**：
    -   **默认阈值**：DLLP的重传是有限次数的，默认的重传阈值是4次。这是为了防止无限重传无法正确接收的数据包，这样的设计可以有效避免系统资源的浪费。
    -   **链路重建**：如果一个数据包重传超过了4次仍然失败，协议规定将触发物理层开始重建（retrain）链路的过程。这个过程涉及到硬件层面的重新同步，可能会影响到链路的性能。
    -   **链路关闭**：如果重建链路依然失败，系统可能会选择将该链路关闭，以维护整个系统的稳定性和性能。

### Virtual Channel & Traffic Control

PCIe流量控制通过交错地使用信用（Credit）系统来管理数据传输，以避免发送方过量发送数据而淹没接收方，造成数据丢失。下面详细解释PCIe流量控制中的信用机制：

1.  **流量类别（Traffic Class, TC）到虚拟通道（Virtual Channel, VC）的映射**：
    
    -   **TC**: 数据根据服务质量要求被分配到不同的流量类别。
    -   **VC**: 每个流量类别可以映射到不同的虚拟通道。VC作为传输路径的逻辑分割，可以有多个，并且每个VC可以有不同的优先级和资源。
2.  **TLP的不同处理方式和信用额度管理**：
    
    -   **Posted (P)**：指那些不需要立即确认的消息，如写操作。
    -   **Non-Posted (NP)**：指那些需要立即确认的操作，如读操作请求。
    -   **Completion (Cpl)**：指完成消息，如读操作的响应。
    -   每种类型的TLP都有独立的信用额度，互不干扰。
3.  **虚拟通道的信用额度**：
    
    -   **独立管理**：每个VC有自己的信用额度，而不是整个链路共享一个信用额度。
    -   **多VC支持**：如果一个链路上有多个VC，每个VC都必须独立进行初始化和信用额度的更新。
4.  **流量控制的三个步骤**：
    
    -   **InitFC1-P/NP/Cpl**：这是流量控制的第一步。接收方根据自己的缓冲能力发送InitFC1消息，向发送方初始化信用额度。
    -   **InitFC2-P/NP/Cpl**：发送方通过InitFC2消息响应接收方的InitFC1消息。虽然InitFC2携带了信用信息，但接收方通常会忽略这些信息。发送此消息后，发送方不再响应后续的InitFC1消息。
    -   **UpdateFC-P/NP/Cpl**：在信用额度初始化后，接收方可使用UpdateFC消息根据实际情况向发送方更新信用额度。

通过以上的信用机制，PCIe确保数据包（特别是TLP）在传输过程中不会超出接收方的处理能力，从而避免了数据丢失和流量拥塞的问题。这个机制类似于网络世界中的流量控制协议，比如TCP的滑动窗口机制。这样的设计允许设备根据自己和对端的能力，动态地调整传输速率和数据量。

![pcie-data-link-layer-fc](/2024/04/14/PCIe-3/pcie-data-link-layer-fc.png)

这个消息中各个字段含义如下：

-   **Type**：消息ID，映射如下：

| Type | Id |
| --- | --- |
| InitFC1-P | 0100b |
| InitFC1-NP | 0101b |
| InitFC1-Cpl | 0110b |
| InitFC2-P | 1100b |
| InitFC2-NP | 1101b |
| InitFC2-Cpl | 1110b |
| UpdateFC-P | 1000b |
| UpdateFC-NP | 1001b |
| UpdateFC-Cpl | 1010b |

-   **VC ID（v\[2:0\]）**：Virtual Channel的ID，ID一共有3位，代表8个VC。
-   **HdrFC**：TLP头部的Credit数量。在发送时，一个TLP头对应着一个Header Credit，无论该TLP的大小。
-   **DataFC**：TLP数据部分的Credit数量。一个 DW（Double Word，双字，即4字节）对应着一个Data Credit。

想象一下，你的电脑想要写入一段数据到内存中，而这段数据有128字节那么长。在PCI Express (PCIe) 协议中，这就意味着你需要告诉内存很多细节，比如数据要写在哪里，这就需要一个包头（TLP头），它占用了16字节（因为每个DW（Data Word）是4字节，所以4 DW就是16字节）。加上你要写的128字节数据，这就构成了我们所说的数据包的有效载荷（Payload）。

现在，还有一个可选的部分叫TLP Digest，如果用到的话，它会再占用4字节。这个东西用于确保数据的完整性没问题。但不是每次传输都需要它。

所以，如果把这所有的东西加起来，你的电脑为了发送这128字节的数据，最多会使用到33个数据信用额度（因为128字节的数据和16字节的头部加起来，总共144字节，除以4字节每个信用额度，正好是36，但是头部占用的那个信用额度是单独算的，所以数据信用额度其实只用了32个，再加上那个可选的TLP Digest占用的1个信用额度，总共是33个）。

现在，假设你的数据已经飞向内存，内存处理了一部分数据后，它会告诉你的电脑：“好了，我处理了一些，你可以继续发送更多的数据了。” 这就是所谓的信用额度更新（UpdateFC消息）。内存会根据它现在还能处理多少数据，也就是它的缓存有多大，来告诉你的电脑还剩下多少信用额度。内存除了在处理完数据后告诉电脑外，它还会定期报告一次，最长不超过30微秒。这是为了防止出现比如CRC校验错误这样的问题，如果这些错误发生了，可能会让更新的信息丢失，这样电脑就不知道还能不能继续发送数据了。

最后，为了能够管理更大量的数据，PCIe还支持一种叫做“比例流量控制”（Scaled Flow Control）的技巧。这意味着信用额度不再是一次一个单位那么简单，而是可以是2的幂次方的数量，比如说2, 4, 8, 16等等，这样就可以灵活地适应不同大小的数据传输需求了。

Scaled Flow Control:

![pcie-data-link-layer-sfc](/2024/04/14/PCIe-3/pcie-data-link-layer-sfc.png)

## 数据链路层小结

整体架构：

![pcie-data-link-layer-arch](/2024/04/14/PCIe-3/pcie-data-link-layer-arch.png)

数据链路层中其实还有很多其他的内容，比如Link的初始化，状态机，电源管理，和Vendor-specific DLLP等等，但没有介绍。

## 参考资料

-   \[1\]: [PCI Express Base Specification](https://pcisig.com/specifications/pciexpress/)
-   \[2\]: [OSDev WIKI - PCI](https://wiki.osdev.org/PCI)
-   \[3\]: [Mindshare - An Introduction to PCI Express](https://www.mindshare.com/files/resources/MindShare_Intro_to_PCIe.pdf)
-   \[4\]: [Wikipedia - PCI Express](https://en.wikipedia.org/wiki/PCI_Express)
