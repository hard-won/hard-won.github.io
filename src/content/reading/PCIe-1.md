---
title: "PCIe, part 1: overall architecture"
date: 2024-04-02T20:35:07-07:00
displayDate: "2024-04-02"
slug: "PCIe-1"
lang: en
category: "interconnect"
tags: []
source:
  title: "PCIe扫盲系列博文连载目录篇（第一阶段）"
  url: "http://blog.chinaaet.com/justlxy/p/5100053251"
description: "An overview of the PCIe layer stack — application, transaction, data link and physical — and what each layer is responsible for."
originalUrl: "/2024/04/02/PCIe-1/"
---
# A short introduction to PCIe

I will skip the history. The short version is that it has been through several generations.

PCIe is the express version of PCI: a high-speed serial bus rather than a traditional parallel one. In serial transmission, data is always carried as packets.

PCIe slots are part of the computer's motherboard — physical, solid slots. They are made of hard plastic and have metal contacts that the matching expansion card plugs into. PCIe slots come in different sizes and configurations, such as x1, x4, x8 and x16, to suit cards with different bandwidth needs. The number is how many data lanes the slot provides; the more lanes, the more data can be moved, which supports higher-performance cards.

![p1](/2024/04/02/PCIe-1/p1.png)

![p2](/2024/04/02/PCIe-1/p2.png)

# Basic PCIe protocol concepts

## Overall structure

![p3](/2024/04/02/PCIe-1/p3.png)

Two devices connect through several layers: the application layer, the transaction layer, the data link layer and the PHY. The application layer is entirely up to the customer. It determines what type of PCIe device this is and what its basic functions are, and it can be implemented in hardware (an FPGA, say) or as a hardware/software combination. For instance, if the device is a Switch, the application layer needs to implement packet routing and related logic. If the device is a Root, the application layer needs to implement the virtual PCIe bus 0 and speak for the whole PCIe bus system to the CPU.

## Transaction layer

The transaction layer is the part responsible for creating, decoding and checking Transaction Layer Packets (TLPs). Put simply, it is a **post office**: it packages (creates) your letter (the packet) properly, makes sure the address and the format of the contents are correct (decode and check), and makes sure that when the letter reaches its destination it can be correctly understood and accepted.

-   **Transmit side**: like preparing a letter before you post it, making sure the address and the postage are right. In the transaction layer it creates the TLP — deciding how the data will be sent, what data needs to be sent, and how that data is packaged.
-   **Receive side**: like the recipient opening the letter, checking that it was sent to them, and reading the contents. In the transaction layer it decodes the received TLP and checks it, to make sure the data has not been corrupted and is complete.
-   **Additional functions**: the transaction layer also contains some advanced features, such as QoS (quality of service, which guarantees the priority and rate of a transfer), flow control (so that a transfer does not overload the receiver), and transaction ordering (which governs the order in which packets are sent and received).

## Data link layer

The data link layer is like the **post office's internal operations**: it makes sure packets (here, Data Link Layer Packets, DLLPs) are transmitted correctly and that receipt is acknowledged.

-   **Creating, decoding and checking DLLPs**: it handles the packets specific to the link layer, the ones that help manage and protect the transfer.
-   **Ack/Nak acknowledgement**: a feedback system used to confirm whether a packet was received successfully (Ack) or needs to be retransmitted (Nak). It is like replying to the sender after a letter arrives, so they know whether you received it.

## Physical layer

The physical layer is the foundation of the transfer, responsible for actually sending and receiving the packets (TLPs, DLLPs and Ordered Sets). Think of it as the **post office's transport network** — the postmen and the vans that physically carry your letter.

-   **Processing**: before the data goes out, the physical layer puts it through a series of steps (byte striping, scrambling and encoding) to optimise the transfer and reduce errors. The receiving side performs the inverse steps to recover the data.
-   **Link training and initialisation**: before a transfer can begin, transmitter and receiver have to "negotiate" so that they send and receive in the same way. This is done through a process called link training and initialisation, normally managed by a state machine (the LTSSM). It is like two post offices agreeing on how they will exchange letters.

In the PCIe architecture, the transaction layer, the data link layer and the physical layer exist in every port, which means a Switch necessarily contains more than one such stack.

![p4](/2024/04/02/PCIe-1/p4.png)

In more detail:

![p5](/2024/04/02/PCIe-1/p5.png)
