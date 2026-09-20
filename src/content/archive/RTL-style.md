---
title: "工业级RTL风格"
date: 2024-05-23T18:19:35-07:00
slug: "RTL-style"
lang: zh
categories: ["技术", "数字IC", "如何成为RTL工程师"]
tags: []
originalUrl: "/2024/05/23/RTL-style/"
---
代码风格很重要，让别人读懂，增加效率。

下面是简单的代码书写风格

# RTL代码书写风格

```verilog
/* STYLE_NOTES begin
  * Throughout this file, these STYLE_NOTES comment blocks will provide some
  *   explanation about the block of code that follows.
  * This first comment block provides some general formatting info.
  *   Use // format for comments.
  *   Limit line length to 80 characters.
  *   Indent using 2 spaces per level.  Don't use tabs.
  *   Organize sections consistently.  (WIRES, then REGISTERS, then ...)
  * The following block is a standard header template.  Don't skimp on the
  *   description.  Include $Id$ and other revision-control flags.
  * STYLE_NOTES end */
//-------------------------------------------------------------------
//
//  COPYRIGHT (C) 2007, your_company
//
//  THIS FILE MAY NOT BE MODIFIED OR REDISTRIBUTED WITHOUT THE
//  EXPRESSED WRITTEN CONSENT OF your_company
//
//  your_company                   http://www.your_company.com
//  your_company_address1          info@your_company.com
//  your_company_address2          your_company_phone
//  your_company_city_state_zip
//-------------------------------------------------------------------
// Title       : coding_style
// Author      : you
// Created     : 01/01/2007
// Description : Where does this file get inputs and send outputs?
// What does the guts of this file accomplish, and how does it do it?
// What module(s) does this file instantiate?
//
// $Id$
//-------------------------------------------------------------------

`timescale 1ns / 1ps

/* STYLE_NOTES begin
  * A generic "clk" named input makes the design portable.  (It is attached to
  *   a more descriptive clk name at a higher level.)
  * "i_" and "o_" are handy ways to label module inputs/outputs.  Especially
  *   useful when viewing waveforms.
  * "rst_n" listed last so you don't have to worry which line omits the comma.
  *   Use "_n" for active-low.  "_l" looks too much like "_1".
  * STYLE_NOTES end*/
module coding_style(
  clk,
  i_buf_req,
  o_buf_ack,
  i_proc_rdata,
  o_proc_raddr,
  rst_n
);

/* STYLE_NOTES begin
  * Include your global constants header files here.
  * STYLE_NOTES end*/
`include "coding_style.vh"

/* STYLE_NOTES begin
  * Comment your I/O by block and by signal
  * STYLE_NOTES end*/
input clk;                                      // clock
input rst_n;                                    // reset
    // signals to/from another_module
input i_buf_req;                                // input buffer request
output o_buf_ack;                               // output buffer ack
    // signals to/from a_different_module
input [`PROC_DWIDTH-1:0] i_proc_rdata;          // processor read data
output [`PROC_AWIDTH-1:0] o_proc_raddr;         // processor read address

/* STYLE_NOTES begin
  * Use parameters for local variables like state machine state enumeration.
  * STYLE_NOTES end*/
//
// PARAMETERS
//
// state machine for controlling something
parameter IDLE = 2'b00;
parameter READ_DATA = 2'b01;
parameter PUSH_DATA = 2'b10;
parameter WAIT_COMPLETE = 2'b11;

/* STYLE_NOTES begin
  * Not necessary to re-declare outputs as wires.
  * When using an always block for logic, wires will be minimal.
  * STYLE_NOTES end*/
//
// WIRES
//
wire some_internal_wire;                        // passed between submodules
wire some_strobe;                               // passed between submodules

/* STYLE_NOTES begin
  * Use "_ff" for single-bit flops.
  * Use "_reg" for multi-bit flops.
  * Use "_next" for all combinatorial d-inputs assigned in always blocks.
  * STYLE_NOTES end*/
//
// REGISTERS
//
reg [1:0] state_proc_reg;                       // processor state machine
reg [1:0] state_proc_next;
reg [`PROC_DWIDTH-1:0] proc_rdata_reg;          // capture proc read data
reg buf_ack_ff;                                 // pulse ack output
reg buf_ack_next;
reg some_level_ff;                              // toggle level signal
reg some_level_next;
reg [`PROC_AWIDTH-1:0] proc_raddr_reg;          // read address output
reg [`PROC_AWIDTH-1:0] proc_raddr_next;
reg [`PROC_DWIDTH-1:0] some_pulse_bus_reg;      // multi-bit output
reg [`PROC_DWIDTH-1:0] some_pulse_bus_next;

/* STYLE_NOTES begin
  * Try to avoid complicated logic assignments in continuous assign
  * statements.  Nested &, |, and ?: notations are extremely hard to follow.
  * For many designs, this section will simply assign the output wires.
  * STYLE_NOTES end*/
//
// ASSIGNMENTS
//
assign o_buf_ack = buf_ack_ff;
assign o_proc_raddr = proc_raddr_reg;

/* STYLE_NOTES begin
  * Only synchronous assigns done here.  Always use non-blocking <=
  * Use "#1" for protecting against issues when interfacing with bad code.
  * Async reset values of "0" are by far the most common, and are not needed
  *   for FPGA (they consume unnecessary resources).
  * STYLE_NOTES end*/
//
// SYNCHRONOUS
//
always @(posedge clk or negedge rst_n)
if (!rst_n) begin
    state_proc_reg <= #1 IDLE;
    buf_ack_ff <= #1 0;
    some_level_ff <= #1 1;
    proc_raddr_reg <= #1 0;
end
else begin
    state_proc_reg <= #1 state_proc_next;
    buf_ack_ff <= #1 buf_ack_next;
    some_level_ff <= #1 some_level_next;
    some_pulse_bus_reg <= #1 some_pulse_bus_next;
    proc_raddr_reg <= #1 proc_raddr_next;
    proc_rdata_reg <= #1 i_proc_rdata;
end

/* STYLE_NOTES begin
  * Do all your logic here, reads more like C code.
  * Make sure your sensitivity list is complete.
  * At the top of the always block, make all your default assignments to
  *   feedback flops or constants such as zeros.
  * All assign statements here must be blocking  =
  * Note that the operation of this state machine makes no real sense!
  * STYLE_NOTES end*/
//
// ASYNCHRONOUS
//
always @(state_proc_reg
  or i_buf_req
  or proc_rdata_reg
  or some_level_ff
  or proc_raddr_reg
) begin
  state_proc_next = state_proc_reg;
  some_level_next = some_level_ff;
  proc_raddr_next = proc_raddr_reg;
  buf_ack_next = 0;
  some_pulse_bus_next = 0;

  // state machine
  case (state_proc_reg)

    //  Normal processing IDLE state.  Wait for the next
    //  buffer request.
    IDLE: begin                         // 0
      if (i_buf_req) begin
        buf_ack_next = 1;               // assert buf_ack pulse
        state_proc_next = READ_DATA;
      end
    end

    //  Some description of what the state does
    READ_DATA: begin                    // 1
      some_pulse_bus_next = `PULSE_BUS_VALUE;
      state_proc_next = PUSH_DATA;
    end

    //  Some description of what the state does
    PUSH_DATA: begin                    // 2
      state_proc_next = WAIT_COMPLETE;
    end

    //  Some description of what the state does
    WAIT_COMPLETE: begin                // 3
      if (proc_rdata_reg == `PROC_RDATA_TRIGGER) begin
        proc_raddr_next = proc_raddr_reg + 1;     // increment address
        some_level_next = ~some_level_ff;         // toggle some_level
        state_proc_next = IDLE;
      end
      else begin
        proc_raddr_next = proc_raddr_reg - 2;     // decrement address by 2
      end
    end

    default : begin
      state_proc_next = IDLE;
    end

  endcase

end

/* STYLE_NOTES begin
  * Always instantiate by port name, not order.
  * Use short instance names to make waveform and synthesis debug easier.
  * Note how "i_", "o_" and "rst_n" order are used here.
  * STYLE_NOTES end*/
//
// INSTANTIATIONS
//
submodule_1 sub1(
  .clk(clk),
  .i_some_internal_wire(some_internal_wire),
  .i_proc_rdata(i_proc_rdata),
  .o_some_strobe(some_strobe),
  .rst_n(rst_n)
);

submodule_2 sub2(
  .clk(clk),
  .i_some_strobe(some_strobe),
  .i_some_level(some_level_ff),
  .o_some_internal_wire(some_internal_wire),
  .rst_n(rst_n)
);

endmodule   // coding_style
```

以上是简单的代码规范

下面开始 引用搬运 一些好的设计作为规范学习

# 蜂鸟E203处理器核的RTL代码风格

## 1\. 使用标准 DFF 模块例化生成寄存器

寄存器是数字同步电路中基本的单元。当使用 Verilog 进行数字电路设计时， 最常见的方式是使用 always块语法生成寄存器。本节介绍蜂鸟 E203 处理器核推荐的原则， 本原则来自严谨的工业级开发标准。

对于寄存器，避免直接使用always块编写，而应该采用模块化的标准 DFF 模块进行例化。示例如下所示, 除时钟(clk)和复位信号(rst\_n)之外, 一个名为**flg\_dfflr**的寄存器还有使能信号 flg\_ena和输入(flg\_nxt) /输出信号(flg\_r)。

```verilog
wire flg_r;
wire flg_nxt= ~flg_r;
wire flg_ena = (ptr_r == ('E203_OITF_DEPTH-1)) & ptr_ena;
```

//此处使用例化 sirv\_gnrl\_dfflr 的方式实现寄存器， 而不使用显式的 always块

```verilog
sirv_gnrl_dfflr #(1) flg_dfflrs(flg_ena, flg_nxt, flg_r, clk, rst_n);
```

使用标准DFF 模块例化的好处以下：

1.  便于全局替换寄存器类型。
2.  便于在寄存器中全局插入延迟。
3.  明确的load-enable 使能信号(如下例中的 flg \_ena)可方便综合工具自动插入寄存器级别的门控时钟以降低动态功耗。
4.  便于规避 Verilog 语法中if-else 不能传播不定态（x 或 z）的问题。（避免bug在仿真过程中被掩盖）

标准 DFF 模块是一系列不同的模块，列举如下：

-   sirv\_gnrl\_dfflrs: 带 load-enable使能信号、带异步 reset信号、复位默认值为1 的寄存器。
-   sirv\_gnrl\_dfflr:带load-enable使能信号、带异步 reset信号、复位默认值为0的寄存器。
-   sirv\_gnrl\_dffl: 带 load-enable使能信号、不带 reset信号的寄存器。
-   sirv\_gnrl\_dffrs:不带 load-enable使能信号、带异步 reset信号、复位默认值为1 的寄存器。
-   sirv\_gnrl\_dffr:不带load-enable使能信号、带异步 reset信号、复位默认值为0的寄存器。
-   sirv\_gnrl\_ltch: Latch模块。

标准 DFF 模块内部则使用 Verilog语法的 always块进行编写, 以 sirv\_gnrl\_dfflr为例,代码如下所示。由于 Verilog if-else 语法不能传播不定态, 因此对于 if条件中 lden信号为不定态的非法情况使用断言(assertion) 进行捕捉。

```verilog
module sirv_gnrl_dfflr # (
    parameter DW= 32
) (
    input lden,
    input [DW-1:0] dnxt,
    output [DW-1:0] qout,
    input clk,
    input rst_n
);

reg [DW-1:0] qout_r;

// 使用always块编写寄存器逻辑
always @(posedge clk or negedge rst_n)
begin : DFFLR_PROC
    if (rst_n == 1'b0)
        qout_r <= {DW{1'b0}};
    else if (lden == 1'b1)
        qout_r <= dnxt;
end

assign qout = qout_r;

// 使用 assertion 捕捉 lden信号的不定态
`ifndef FPGA_SOURCE
`ifndef SYNTHESIS
sirv_gnrl_xchecker # (
    .DW(1)
) u_sirv_gnrl_xchecker ( //该模块内部是使用SystemVerilog编写的断言
    .i_dat(lden),
    .clk (clk)
);
`endif
`endif

endmodule
```

sirv\_gnrl\_xchecker模块的代码片段 ,

此模块专门捕捉不定态，一旦输入的i\_dat出现不定态， 则会报错并终止仿真

```verilog
module sirv_gnrl_xchecker # (
parameter DW= 32
) (
input [DW-1:0] i_dat,
input clk
);
CHECK_THE_X_VALUE:
assert property (@(posedge clk)
((^(i_dat)) !== 1'bx)
)
else $fatal ("\n Error: Oops, detected a X value!!! This should never happen. \n");
endmodule
```

## 2\. 推荐使用 assign语法替代 if-else 和case语法

Verilog中的 if-else 和 case 语法存在两大缺点。

-   不能传播不定态。
-   会产生优先级的选择电路而非并行选择电路， 从而不利于优化时序和面积。

为了规避这两大缺点， 蜂鸟E203 处理器核推荐使用 assign 语法进行代码编写， 本原则来自严谨的工业级开发标准。

Verilog的 if-else不能传播不定态， 以如下代码片段为例。假设a的值为X(不定态)，按照 Verilog语法它会将等效于a==0,从而让 out等于in2, 最终没有将X(不定态) 传播出去。这种情况可能会在仿真阶段掩盖某些致命的bug， 造成芯片功能错误。

```verilog
if(a)
out = inl;
else
out = in2;
```

而使用功能等效的 assign语法,如下所示, 假设a的值为X(不定态), 按照 Verilog语法，则会将X(不定态) 传播出去， 从而让out也等于X。通过对X(不定态) 的传播，开发人员可以在仿真阶段将bug彻底暴露出来

```verilog
assign out = a ? in1 : in2;
```

虽然现在有的EDA 工具提供的专有选项(例如 Synopsys VCS 提供的 xprop 选项)可以将 Verilog 原始语法中定义的“不传播不定态”的情形强行传播出来， 但是一方面， 不是所有的EDA 工具支持此功能； 另一方面，在操作中此选项也时常被忽视， 从而造成疏漏。

Verilog 的 Case语法也不能传播不定态,与问题一中的 if-else 同理。而使用等效的 assign 语法即可规避此缺陷。

Verilog 的if-else 语法会被综合成优先级选择电路， 面积和时序均没有得到充分优化， 如下所示。

```verilog
if(sell)
out = in1[3:0];
else if (sel2)
out = in2[3:0];
else if (sel3)
out = in3[3:0];
else
out = 4'b0;
```

如果此处确实要生成一种优先级选择逻辑， 则推荐使用 assign 语法等效地写成如下形式， 以规避X(不定态)传播的问题。

```verilog
assign out = sell ? in1[3:0] :
             sel2 ? in2[3:0] :
             sel3 ? in3[3:0] :
             4'b0;
```

而如果此处本来要生成一种并行选择逻辑，则推荐使用 assign语法明确地使用“与或”逻辑， 代码如下。

```verilog
assign out  = ({4{sel1}} & in1[3:0])
              |  ({4{sel2}} & in2[3:0])
              |  ({4{sel3}} & in3[3:0]) ;
```

使用明确的assign语法编写的“与或”逻辑一定能够保证综合成并行选择的电路。

同理， Verilog 的 case 语法也会被综合成优先级选择电路，面积和时序均未充分优化。有的EDA 综合工具可以提供注释(例如 synopsys parallel\_case 和full\_case)来使综合工具综出并行选择逻辑，但是这样可能会造成前后仿真不一致的严重问题，从而产生重大的 bug。因此在实际的工程开发中， 注意以下两点。

应该明令禁止使用EDA 综合工具提供的注释(例如 synopsys parallel\_case 和 full\_case)。

应该使用等效的 assign 语法设计电路。

## 3.其他若干注意事项

其他编码风格中的若干注意事项如下。

-   由于带 reset信号的寄存器面积略大，时序稍微差一点， 因此在数据通路上可以使用不带reset信号的寄存器， 而只在控制通路上使用带 reset信号的寄存器。
-   信号名应该避免使用拼音，使用英语缩写， 信号名不可过长， 但是也不可过短。代码即注释， 应该尽量让开发人员能够从信号名中看出其功能。
-   Clock和 Reset信号应禁止用于任何其他的逻辑功能, Clock 和 Reset信号只能接入DFF，作为其时钟和复位信号。
