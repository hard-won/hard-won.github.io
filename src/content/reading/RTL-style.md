---
title: "Industrial-grade RTL style"
date: 2024-05-23T18:19:35-07:00
displayDate: "2024-05-23"
slug: "RTL-style"
lang: en
category: "rtl"
tags: []
description: "A collection of RTL coding-style rules: a fully commented Verilog style template, and the Hummingbird E203 core's conventions for standard DFF instantiation and for preferring assign over if-else and case."
originalUrl: "/2024/05/23/RTL-style/"
---
Coding style matters. It lets other people read what you wrote, and that makes everyone faster.

What follows is a simple way of writing code.

# How to write RTL

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
That was a simple set of coding conventions.

From here on I am quoting and carrying over some good designs, to study as conventions.

# The RTL coding style of the Hummingbird E203 processor core

## 1. Generate registers by instantiating a standard DFF module

The register is the basic unit of a synchronous digital circuit. When designing digital circuits in Verilog, the most common way to create one is the always block. This section covers the principle the Hummingbird E203 processor core recommends; the principle comes from a rigorous industrial-grade development standard.

For registers, avoid writing an always block directly; instantiate a modular, standard DFF module instead. An example follows. Besides the clock (clk) and the reset (rst\_n), a register named **flg\_dfflr** also has an enable, flg\_ena, and an input (flg\_nxt) and output (flg\_r).

```verilog
wire flg_r;
wire flg_nxt= ~flg_r;
wire flg_ena = (ptr_r == ('E203_OITF_DEPTH-1)) & ptr_ena;
```

// the register is realised here by instantiating sirv\_gnrl\_dfflr, not by an explicit always block

```verilog
sirv_gnrl_dfflr #(1) flg_dfflrs(flg_ena, flg_nxt, flg_r, clk, rst_n);
```

What instantiating a standard DFF module buys you:

1.  Register types are easy to swap out globally.
2.  Delays are easy to insert into registers globally.
3.  An explicit load-enable (flg\_ena in the example below) lets the synthesis tool insert register-level clock gating automatically and cut dynamic power.
4.  It sidesteps the Verilog problem that if-else cannot propagate unknowns (x or z). (Which keeps bugs from being masked during simulation.)

The standard DFF modules are a family:

-   sirv\_gnrl\_dfflrs: with load-enable, with asynchronous reset, reset value 1.
-   sirv\_gnrl\_dfflr: with load-enable, with asynchronous reset, reset value 0.
-   sirv\_gnrl\_dffl: with load-enable, no reset.
-   sirv\_gnrl\_dffrs: no load-enable, with asynchronous reset, reset value 1.
-   sirv\_gnrl\_dffr: no load-enable, with asynchronous reset, reset value 0.
-   sirv\_gnrl\_ltch: the latch module.

Inside, the standard DFF modules are written with Verilog always blocks. Take sirv\_gnrl\_dfflr; the code is below. Because Verilog's if-else cannot propagate unknowns, the illegal case where the if condition's lden signal is unknown is caught with an assertion.

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

// register logic written with an always block
always @(posedge clk or negedge rst_n)
begin : DFFLR_PROC
    if (rst_n == 1'b0)
        qout_r <= {DW{1'b0}};
    else if (lden == 1'b1)
        qout_r <= dnxt;
end

assign qout = qout_r;

// an assertion catches an unknown on lden
`ifndef FPGA_SOURCE
`ifndef SYNTHESIS
sirv_gnrl_xchecker # (
    .DW(1)
) u_sirv_gnrl_xchecker ( // inside, this module is an assertion written in SystemVerilog
    .i_dat(lden),
    .clk (clk)
);
`endif
`endif

endmodule
```

A fragment of the sirv\_gnrl\_xchecker module.

This module exists to catch unknowns: the moment its input i\_dat goes unknown, it reports an error and aborts the simulation.

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

## 2. Prefer assign over if-else and case

Verilog's if-else and case have two big drawbacks.

-   They cannot propagate unknowns.
-   They produce priority selection logic rather than parallel selection logic, which works against timing and area.

To sidestep both, the Hummingbird E203 processor core recommends writing with assign; the principle comes from a rigorous industrial-grade development standard.

Verilog's if-else cannot propagate unknowns. Take the fragment below. Suppose a is X (unknown); by Verilog's rules that is equivalent to a==0, so out becomes in2, and the X never propagates out. In this situation a fatal bug can be masked during simulation, and the chip's function comes out wrong.

```verilog
if(a)
out = inl;
else
out = in2;
```

With the functionally equivalent assign below, if a is X, Verilog's rules do propagate the X, so out is X too. Propagating the X is what lets a developer expose the bug fully during simulation.

```verilog
assign out = a ? in1 : in2;
```

Some EDA tools do now offer a proprietary option (Synopsys VCS's xprop, for instance) that forces propagation in the cases Verilog's own semantics define as non-propagating. But not every EDA tool supports it, and in practice the option is often overlooked, so things slip through.

Verilog's case cannot propagate unknowns either, for the same reason as if-else above. The equivalent assign sidesteps the flaw.

Verilog's if-else synthesises into priority selection logic, with area and timing both left unoptimised, as below.

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

If priority selection logic really is what you want here, write it equivalently with assign, as below, to sidestep the X-propagation problem.

```verilog
assign out = sell ? in1[3:0] :
             sel2 ? in2[3:0] :
             sel3 ? in3[3:0] :
             4'b0;
```

And if parallel selection logic is what you want here, write the AND-OR logic out explicitly with assign:

```verilog
assign out  = ({4{sel1}} & in1[3:0])
              |  ({4{sel2}} & in2[3:0])
              |  ({4{sel3}} & in3[3:0]) ;
```

AND-OR logic written explicitly with assign is guaranteed to synthesise into parallel selection.

Verilog's case likewise synthesises into priority selection logic, with area and timing left unoptimised. Some EDA synthesis tools offer pragmas (synopsys parallel\_case and full\_case, for instance) that make the tool synthesise parallel selection logic, but that can cause a serious pre- versus post-synthesis simulation mismatch, and a major bug with it. So in real engineering work, note two things.

Pragmas offered by EDA synthesis tools (synopsys parallel\_case and full\_case, for instance) should be banned outright.

The circuit should be designed with the equivalent assign.

## 3. A few other things to watch

Some other things to watch in coding style.

-   A register with a reset is slightly larger and slightly worse for timing, so the datapath can use registers without reset and only the control path needs registers with reset.
-   Signal names should avoid pinyin and use English abbreviations; a signal name should be neither too long nor too short. The code is the comment, so as far as possible a developer should be able to see what a signal does from its name.
-   Clock and reset signals must not be used for any other logic function. Clock and reset go into DFFs, as their clock and reset, and nowhere else.
