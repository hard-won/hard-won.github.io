---
title: "高速接口PCIe无痛入门（二）事务层"
date: 2024-04-14T12:42:40-07:00
displayDate: "2024-04-14"
slug: "PCIe-2"
lang: zh
categories: ["技术", "数字IC", "高速IO"]
tags: []
originalUrl: "/2024/04/14/PCIe-2/"
---
Reference：[https://r12f.com/posts/pcie-3-tl-dll/](https://r12f.com/posts/pcie-3-tl-dll/)

上篇主要是总体的大致架构，这节开始每一层详细。

# PCIe总线通信机制

假设进行read操作，首先Requester给Completer发送一个Request，然后Completer通过Completion Packet返回要read的data或error info。

在PCIe的Spec里规定了四种Request：**Memory**，**IO**，**Configuration**，**Message**。前三种是从PCI/PCI-X继承过来的，第四种Message是PCIe新增的类型。

![PCIe\_Request](/2024/04/14/PCIe-2/PCIe_Request.png)

上面值得注意的是，Memory Write和Message是Posted类型的，其他都是Non-Posted类型的。

Non-Posted：Requester发送一个包含Request的包以后，必须要得到一个包含Completion包的Response，这一次传输才算结束，不然会一直wait。

Posted：Requester的请求并不需要Completer发送包含Completion的包进行应答，也不需要wait。

Posted的操作对总线的Utilization效率要 >> Non-Posted。分这两种类型是因为，对Memory Write来说，对效率要求高。但不意味着Posted完全不需要Completer进行应答，Completer可以采用Ack/Nak机制（在Data Link Layer实现）。

# 事务层（Transaction Layer）

这是PCIe协议栈的最上层，定义了所有和用户相关的PCIe操作。

## Transaction

PCIe的所有操作都被称为一个Transaction，分为四类：

-   内存事务（Memory Transaction）
-   IO事务（IO Transaction）
-   配置事务（Configuration Transaction）
-   消息事务（Message Transaction）

一个事务根据其请求的处理方式又被分为两种：

-   **Non-Posted**：每个事务的请求消息发送出去后，会需要一个完成消息（Completion）来完成事务。比如，读内存。
-   **Posted**：请求发送后不需要完成消息，属于Fire and forget。比如，写内存和所有的消息事务（这也是唯二的两类请求）

所以，事务层的消息有三类：Non-Posted（NP），Posted（P）和Completion（Cpl）。

## TLP（Transaction Layer Packet）

PCIe的Transaction Request和Completion的消息都是以TLP为单位传输的。

![pcie-tlp](/2024/04/14/PCIe-2/pcie-tlp.png)

-   **TLP Prefix**：用来实现一些高级特性，比如精确时间测量（Precision Time Measurement），因为它不是必须的，所以我们先跳过。
-   **TLP Digest**：4个字节，可以存放诸如CRC的校验码，不过一般不需要开启，因为后面说的数据链路层已经自带了校验了，这里相当于是双保险。
-   **TLP Header**：这个是TLP中最重要的部分，我们后面马上会详细介绍。
-   **TLP Payload**：这个是TLP中的数据部分，根据不同的事务类型，其大小也不同。比如，读事务就不需要Payload。另外Payload的大小也是有限制的，它不能超过`Max_Payload_Size`，最大为4096字节。

### TLP Header

TLP的头部（Header）设计用于确保数据能正确传输与解析。头部的长度根据处理地址的长度可能是12字节（称为3DW）或16字节（称为4DW）。

-   **3DW** vs **4DW**: 3DW和4DW的区别主要在于地址字段的长度。3DW用于32位地址，而4DW则用于64位地址，以支持更大的地址空间。
-   **头部结构**: TLP的头部包括多个字段，第一个DW（Double Word，双字，等于4个字节）是所有类型的TLP都共有的。这4个字节包含了描述该事务本身的信息和行为的大部分字段。这些字段包括：
    1.  **格式与类型（Format and Type）**: 标识TLP的格式（比如3DW或4DW）和类型（比如内存读取、写入等）。
    2.  **事务ID（Transaction ID）**: 包含发起该事务的设备的ID，用于事务的追踪和管理。
    3.  **长度（Length）**: 指示数据字段的长度，单位是DW。
-   **变化部分**: 头部的后续8个字节（即第二和第三个DW）则根据事务类型的不同而有所不同。例如，内存读写事务会包含目的地址信息，而配置读写事务则包括配置空间的偏移和被访问的设备的信息。

其前四个公共字节如下：

![pcie-tlp-header-common-fields](/2024/04/14/PCIe-2/pcie-tlp-header-common-fields.png)

> Fmt字段解释

“Fmt”字段位于TLP头部的最前面，通常占据第一个字节的前三位（Bit 7, 6, 5）。这个字段的具体设置指示了TLP的基本格式和处理方式：

-   **Bit 7**: 当此位为1时，指示这个TLP包含一个前缀（TLP Prefix），通常用于添加额外的路由或安全信息。如果是1，则“Fmt”必须是100，这是专门用于包含前缀的TLP格式。
-   **Bit 6**: 这一位用于区分读写事务。如果为1，表示是读事务，意味着TLP头部之后没有Payload；如果为0，则表示是写事务，TLP头部之后有Payload。
-   **Bit 5**: 用于指示地址的位数。如果为1，则使用32位地址，头部长度为12字节（3DW Header）；如果为0，则使用64位地址，头部长度为16字节（4DW Header）。

> 其他重要字段

-   **Type**: 这个字段定义了TLP的事务类型，如内存事务、I/O事务、配置事务、消息事务等。
-   **LN (Lightweight Notification)**: 标识该内存请求或完成消息是否为轻量级通知。
-   **TH (TLP Hints)**: 表示是否启用了TPH (TLP Processing Hint) 以及是否存在TPH TLP前缀。
-   **TD (TLP Digest)**: 指示是否包含TLP摘要。如果为1，则有TLP Digest；如果为0，则没有TLP Digest。
-   **EP (Error Poisoning)**: 用于标识数据是否有错误。如果为1，则表示数据被标记为错误；如果为0，则无错误。
-   **AT (Address Translation)**: 与虚拟化相关的字段，指示地址转换的状态。00表示无地址转换，01表示需要地址转换，10表示地址转换已完成，11保留。
-   **Length**: 定义Payload的长度，单位为DW (Double Word)。1DW等于4字节。

这里有两个字段TC和Attr没有介绍，因为它们是Transaction Descriptor事务描述符的一部分，马上就会介绍。

### 事务描述符 Transaction Descriptor

事务描述符是TLP头中的关键组成部分，包括事务ID（Requester ID和Tag两个字段），消息的属性（Attr字段），流量分类（TC字段），这些字段在多数事务中都是必须的，提供了关于事务发起者和处理方式的重要信息。

这四个字段几乎会在所有的消息中存在（某些情况下Tag会被忽略），这里用一个内存请求的消息来做例子，展示它们在TLP中的位置：

![pcie-tlp-memory-tx-desc](/2024/04/14/PCIe-2/pcie-tlp-memory-tx-desc.png)

#### 事务ID Transaction ID

事务ID（Transaction ID）在PCI Express (PCIe) 中是一个至关重要的元素，用于标识并跟踪各种事务。事务ID由两个主要部分组成：Requester ID和Tag。

##### Requester ID

Requester ID是一个16位的字段，用于唯一标识发起PCIe事务的设备。这个ID是基于BDF格式（Bus Device Function，总线设备功能）编码的，其中包括：

-   **Bus**: 总线号，表示PCIe设备连接的总线。
-   **Device**: 设备号，表示在特定总线上的设备。
-   **Function**: 功能号，表示在特定设备上的逻辑单元。

这种结构确保了每个发起事务的device都可以被唯一确定，并且在数据传输过程中可以清楚地识别出source和target。

##### Tag

Tag是一个10位的字段，为每一个发出的TLP分配一个唯一的标签。这个标签对于PCIe系统来说非常重要，因为它帮助系统进行以下操作：

-   **数据传输跟踪**: 确保可以追踪每个事务的状态，从而正确地处理响应和重传。
-   **并行处理**: 在多个事务同时进行时，Tag帮助确保各个事务的数据不会混淆。
-   **流控制和乱序处理**: 系统可以使用Tag来管理数据包的接收顺序，确保数据即使在乱序到达时也能被正确重组。

##### 特殊位：T8和T9

在Tag的10个位中，T8和T9两个位通常与其他位分开处理（绿色高亮）。为了使用完整的10位Tag，系统必须启用“10-Bit Tag Requester Enable”配置寄存器。这个功能的启用允许系统处理更大量的并发事务，提高了PCIe接口的效率和多任务处理能力。

事务ID通过其两个组成部分（Requester ID和Tag）为PCIe提供了一种强大的方式来标识、跟踪和管理跨系统的数据传输。这确保了在高负载和多任务环境中数据传输的准确性和系统的高效运行。

#### 消息属性 Attributes

消息属性（Attr字段）由三个位组成，这些位定义了TLP的处理优先级和数据一致性要求。这个字段虽然只有三个比特位，但它对于确定如何在系统中传输和处理TLP至关重要。高两位 Attr\[2:1\]（Byte 1 - Bit 2，Byte 2 - Bit 5）用于控制消息处理的Ordering，而最低位 Attr\[0\]（Byte 2 - Bit 4）用于控制Coherency。

![pcie-tlp-tx-attributes](/2024/04/14/PCIe-2/pcie-tlp-tx-attributes.png)

##### 消息处理顺序 Ordering

Attr\[2:1\]这两个Bits用于控制消息处理的顺序，一共有四种情况：

| **Attr\[2\]** | **Attr\[1\]** | **顺序类型** | **说明** |
| --- | --- | --- | --- |
| 0 | 0 | 强制顺序 | Default值，不允许乱序处理 |
| 0 | 1 | Relaxed Ordering | 允许Completer在当前请求没有完成的时候，同时处理任何后续的Request |
| 1 | 0 | ID-based Ordering | 允许Completer在当前请求没有完成的时候，同时处理来自其他device的Request |
| 1 | 1 | 无序 | 相当于是Relaxed Ordering和ID-based Ordering的并集，允许接收者在当前请求没有完成的时候，同时处理任何的请求 |

##### No Snoop

NoSnoop（Attr\[0\]）使用来控制缓存一致性Coherency的。

Cache Coherency缓存一致性的重要性：

在一个Multi-Processor System中，每个Processor或Device可能有自己的Cache。如果这些Cache没有被适当地同步，就会出现问题：

-   **数据过时** **Data Staleness**：一个处理器的Cache中的数据可能比系统中的其他部分的数据更旧，因此它可能会基于过时的信息做出决策。
-   **数据冲突** **Data Conflicts**：不同的处理器可能会同时尝试修改同一数据块，如果Cache不一致，就可能导致数据丢失或错误。

NoSnoop（Attr\[0\]，无窥探属性）是在PCI Express (PCIe) 传输中使用的一个重要属性，用于控制缓存一致性。在默认情况下（值为0），PCIe的请求会遵循缓存一致性的规则。这意味着，例如在进行内存读请求时，系统会首先检查缓存（Cache）中是否存在所需数据。如果缓存中没有找到数据，系统才会从主内存中读取。

然而，当NoSnoop的值设置为1时，PCIe会跳过缓存直接访问主内存。这种操作可以提高性能，因为它减少了查询缓存的步骤，特别是在那些我们知道数据不在Cache中或者Cache Coherency不是关键因素的情况下。但这种做法也带来了一定的风险，因为如果缓存中的数据已被修改但尚未写回主内存，直接从Main Memory中读取数据可能会得到**过时**或**错误**的数据，从而导致数据一致性问题。

因为这种潜在的一致性风险，许多类型的PCIe事务禁止使用NoSnoop标志。这包括配置事务、I/O事务、大多数消息事务以及MSI（Message Signaled Interrupts，消息信号中断）。使用NoSnoop属性进行这些事务可能会导致严重的错误，如DMA（Direct Memory Access，直接内存访问）操作错误，或读取到的数据不准确。

总之，NoSnoop属性在特定场景下可以提供性能优势，但在使用时需要仔细考虑其对系统一致性的影响。

#### 流量分类 Traffic Class

Traffic Class (TC, 流量类别) 用于流量控制。TC 总共有3个比特，意味着可以定义最多8个不同的流量类别（0到7）。这些类别允许网络在传输过程中区分不同类型的数据，确保某些数据（如实时数据包）可以获得更高的优先级。

![pcie-tc-vc-config](/2024/04/14/PCIe-2/pcie-tc-vc-config.png)

##### TC 与 VC（Virtual Channel, 虚拟通道）的合作机制：

1.  **虚拟通道（VC）**:
    
    -   每条PCIe物理链路（Link）都可以创建多个VC。每个VC是一个独立的传输通道，都有自己的流量控制机制。
    -   这些VC可以独立工作，彼此之间不会直接干扰。
2.  **TC到VC的映射**:
    
    -   一个或多个TC可以映射到一个VC上。这意味着通过改变传输数据包（Transaction Layer Packet, TLP）的TC标签，可以控制这个数据包应该通过哪个VC传输。
    -   这种映射提供了一种方法，通过调整TC来改变数据的传输路径和优先级。
3.  **信用机制**:
    
    -   每个VC都具备信用机制（Credit Mechanism），用于控制数据包的发送频率。
    -   每个VC有自己的Credit Pool（信用池）。只要VC的信用点数不为0，它就可以发送TLP，并消耗一定数量的信用点数。
    -   VC的信用点数会在特定时刻自动补充，确保数据传输可以持续进行，避免因信用耗尽而中断。
4.  **默认行为**:
    
    -   TC的默认值是0，这也是所有PCIe设备必须实现的基本配置。TC为0的TLP会被Hardcoded（硬编码）映射到VC0。
    -   如果没有对TC进行特定的设置，所有的TLP都将通过VC0进行传输。
5.  **顺序性**:
    
    -   如果两个数据包分别映射到不同的VC或者使用了不同的TC，PCIe不保证这两个包的传输顺序。

示例：

假设我们需要对一些急需处理的数据包给予高优先级，我们可以将这些数据包的TC设置为1，并映射到一个专门配置的VC（如VC1），这个VC可以有更高的信用分配和优先级设置。这样，即使在高流量情况下，这些高优先级的数据包也能快速传输。

通过上述机制，PCIe可以灵活地对不同类型的数据传输进行管理和优先级控制。这里我们主要了解TC到VC的映射，关于VC的具体机制，会在后面数据链路层介绍。

## TLP事务路由

TLP事务路由是确保数据正确传送到目的地的关键机制。

### TLP事务路由的两种基本类型：

看Byte 8

1.  **基于地址的路由 (Address-Based Routing)**:
    
    ![pcie-tlp-routing-address](/2024/04/14/PCIe-2/pcie-tlp-routing-address.png)
    
    -   这种路由方式主要用于内存事务（Memory Transaction）和IO事务（IO Transaction）。
    -   在这种情况下，目的地是通过具体的内存或I/O地址来指定的。当发起一个事务时，Source Device会在TLP中指定一个具体的地址，这个地址指向数据需要被读取或写入的位置。
    -   路由机制会解析这个地址，并将事务导向正确的目的设备或内存位置。这种基于地址的路由依赖于系统的地址映射表来确定数据最终的目标位置。
2.  **基于ID的路由 (ID Based Routing)**:
    
    ![pcie-tlp-routing-id](/2024/04/14/PCIe-2/pcie-tlp-routing-id.png)
    
    -   这种路由方式适用于不直接涉及内存地址的事务，如配置事务（Configuration Transaction）、消息事务（Message Transaction）以及事务完成的消息通知（Completion）。
    -   在这种路由模式下，目的地是通过一个叫做BDF（Bus/Device/Function）的ID来指定的。BDF为每个设备和功能在总线上提供了一个唯一标识。
    -   当PCIe需要向特定设备或功能发送配置指令或消息时，它使用BDF作为目的地标识。系统根据这个ID来确定消息应该被发送到哪个设备或哪个功能上。

### 特殊的ID分配方式 - ARI (Alternative Routing ID):

![pcie-tlp-routing-id-ari](/2024/04/14/PCIe-2/pcie-tlp-routing-id-ari.png)

-   ARI是一种改进的设备标识分配方式，允许一个单一物理Device支持更多的功能。
-   在传统的PCIe配置中，设备号（Device Number）和功能号（Function Number）有固定的位数分配，限制了单一物理设备上可支持的功能数量。
-   ARI调整了这些位数的分配，将一些原本分配给设备号的位数转给功能号。这样做的结果是，单一Device可以拥有更多的功能号，从而支持更复杂或更多样化的操作。

## TLP小结

最核心的TLP公用字段都介绍完了。包括TLP主题格式，事务如何分类，如何路由，如何进行流控等等。为了再来整体的来看一下事务层的处理，我们可以参照Intel Cyclone 10的总体框图，如下：

![pcie-transaction-layer-arch](/2024/04/14/PCIe-2/pcie-transaction-layer-arch.png)

当然在TLP的头中，仍有很多字段没有涉足，这些字段都和具体的事务类型相关，所以在这一篇中就不会过多的深入了。毕竟，这一篇主要是想聚焦在PCIe的通信协议本身上，来展示PCIe是如何进行通信的，关于每个具体的事务及其格式，会放在后面单独的说。

TLP传输示意图

![TLP](/2024/04/14/PCIe-2/TLP.png)
