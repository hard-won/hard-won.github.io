---
title: "Advanced Computer Architecture CA1: the branch predictor contest"
date: 2024-04-12T14:15:03-07:00
displayDate: "2024-04-12"
slug: "Advanced-Architecture-CA1"
lang: en
category: "architecture"
tags: []
source:
  title: "ECE-209-S24-CA1"
  url: "https://docs.google.com/document/d/1wGhjB8iqROP4Ovs78SrmGrZcxDbrATPX9CFyKd7pTxo/edit"
furtherReading:
  - title: "CPU分支预测算法及其演进"
    url: "https://www.cnblogs.com/arthurzyc/p/16895277.html"
  - title: "分支预测器（Branch Predictor） 汇总介绍"
    url: "https://blog.csdn.net/edonlii/article/details/8754724"
  - title: "Satjpatel/Branch-Predictor-Project — my_predictor.h"
    url: "https://github.com/Satjpatel/Branch-Predictor-Project/blob/fb34a61660f788c0339b68218e5c790d43d77e0e/Newr%20Final%20Infrastructure/cbp2-infrastructure-v3/src/my_predictor.h#L37"
description: "Coursework notes on the CA1 branch predictor contest: reading the G-share baseline, why lengthening its history made things worse, and the local plus bimodal hybrid built on top of it."
originalUrl: "/2024/04/12/Advanced-Architecture-CA1/"
---
# Walking through the example

![G-share](/2024/04/12/Advanced-Architecture-CA1/G-share.png)

The example uses a G-share predictor, which XORs the global history with the PC. The reason for doing that is that the PC is too long, so we only take a few of its bits — but that raises a problem, because some instructions share those same few PC bits, and storing them in the prediction table would skew the result. So we XOR the global history with the PC. The value that comes out of the XOR has no meaning in itself and does not tell you anything (such as whether this instruction has been taken before); it serves only as the index into the prediction table. It is the value at that index (00 strongly not taken, 01, 10, 11) that tells the predictor whether the branch has been taken. Why XOR: first, it decouples nicely and frees up the original PC value; second, it works the PC over so that more PCs can be told apart, giving a number of indices greater than the number of distinct values in those few PC bits.

```c++
// my_predictor.h
// This file contains a sample my_predictor class.
// It is a simple 32,768-entry gshare with a history length of 15.
// Note that this predictor doesn't use the whole 32 kilobytes available
// for the CBP-2 contest; it is just an example.

// my update
class my_update : public branch_update {
public:
	unsigned int index;
};

// Default predictor
class my_predictor : public branch_predictor {
public:
#define HISTORY_LENGTH	15
#define TABLE_BITS	15
	my_update u;
	branch_info bi;
	unsigned int history;
	unsigned char tab[1<<TABLE_BITS];

	// initialize
	my_predictor (void) : history(0) {
		memset (tab, 0, sizeof (tab));
	}

	branch_update *predict (branch_info & b) {
		bi = b;
		if (b.br_flags & BR_CONDITIONAL) {
			u.index =
				  (history << (TABLE_BITS - HISTORY_LENGTH))  // GH
				^ (b.address & ((1<<TABLE_BITS)-1)); // PC
			u.direction_prediction (tab[u.index] >> 1);
		} else {
			u.direction_prediction (true);
		}
		u.target_prediction (0);
		return &u;
	}

	void update (branch_update *u, bool taken, unsigned int target) {
		if (bi.br_flags & BR_CONDITIONAL) {
			unsigned char *c = &tab[((my_update*)u)->index];
			if (taken) {
				if (*c < 3) (*c)++;
			} else {
				if (*c > 0) (*c)--;
			}
			history <<= 1;
			history |= taken;
			history &= (1<<HISTORY_LENGTH)-1;
		}
	}
};
```

G-share results:

```
traces/164.gzip/gzip.trace.bz2          	12.473
traces/175.vpr/vpr.trace.bz2            	13.415
traces/176.gcc/gcc.trace.bz2            	11.254
traces/181.mcf/mcf.trace.bz2            	15.837
traces/186.crafty/crafty.trace.bz2      	5.837
traces/197.parser/parser.trace.bz2      	10.008
traces/201.compress/compress.trace.bz2  	7.831
traces/202.jess/jess.trace.bz2          	1.562
traces/205.raytrace/raytrace.trace.bz2  	2.756
traces/209.db/db.trace.bz2              	3.909
traces/213.javac/javac.trace.bz2        	2.267
traces/222.mpegaudio/mpegaudio.trace.bz2	2.188
traces/227.mtrt/mtrt.trace.bz2          	2.657
traces/228.jack/jack.trace.bz2          	3.033
traces/252.eon/eon.trace.bz2            	1.807
traces/253.perlbmk/perlbmk.trace.bz2    	2.554
traces/254.gap/gap.trace.bz2            	3.926
traces/255.vortex/vortex.trace.bz2      	1.222
traces/256.bzip2/bzip2.trace.bz2        	0.094
traces/300.twolf/twolf.trace.bz2        	21.489
average MPKI: 6.305
```

Branch misprediction rate by program (misses per kilo instructions, MPKI), the key metric for a branch predictor's performance. The numbers show how various kinds of program do under the G-share predictor: some have a high MPKI, meaning mispredictions are frequent, while others have a low MPKI and are predicted relatively accurately.

Looking at the data, programs like `twolf` and `mcf` show a very high MPKI, possibly because their branch patterns are especially complex or they contain a great many loops and conditional branches, which G-share may not handle well. A program like `bzip2` shows an extremely low MPKI, which suggests its branch patterns are relatively simple, or match G-share's prediction pattern very closely.

The limits on G-share's performance:

1.  **Index conflicts (the alias problem):**
    -   Using XOR to generate the index can make different combinations of branch history and PC address land on the same index. Aliasing like this can cause mispredictions, because unrelated branches share a prediction-table entry and interfere with each other.
2.  **The fixed global history length:**
    -   G-share generates its index from a global history of fixed length, which may not be enough to capture long-range dependencies or complex branch patterns, especially in large or complex programs.
3.  **The prediction table's size:**
    -   The table's size directly determines how many branch contexts can be tracked. A limited table means more conflicts and more replacement, especially in large applications with wide-ranging branch behaviour.
4.  **The limits of one uniform prediction policy:**
    -   G-share applies one uniform prediction policy to every branch, taking no account of the variety of branch types or the complexity of the program context.

My own thoughts. To improve G-share's performance, here are some strategies to consider for now:

-   **Use a hybrid or tournament predictor**: combine predictors of different kinds, such as a local history predictor and a G-share predictor, and use a selector to pick whichever performs best.
-   **Increase the history length and the table size**: as far as resources allow, lengthen the global history and enlarge the prediction table, to reduce conflicts and improve accuracy.
-   **Improve the XOR hash**: try a more elaborate hash function in place of plain XOR, to lower the conflict rate.
-   **Bring in path awareness**: use path information, or the program's execution context, to strengthen the predictor's decisions.

When I changed only the history table length, raising `HISTORY_LENGTH` from 15 to 16, I lengthened the history the branch predictor uses. In theory that change should give the predictor more historical data to make a more accurate prediction with. In practice, though, MPKI (misses per kilo instruction) went up, which says accuracy actually got worse. Why:

### 1. Overfitting to the history

Enlarging `HISTORY_LENGTH` can make the predictor overfit to particular histories, especially when the history is unstable or too complex. That can leave the predictor doing badly when it meets a new situation that does not follow a history it has already seen. It is like a person who decides only from past experience: sometimes they miss the right way to handle something new. A predictor is the same. If the history is too long, it can struggle to respond flexibly to new situations that do not match past patterns.

### 2. Table entry collisions

If `TABLE_BITS` stays the same and only `HISTORY_LENGTH` goes up, there can be more index collisions. More history information is now compressed into an index table of the same size, so different histories can map to the same entry, which raises the chance of a conflict and lowers prediction accuracy. It is as if the predictor has one table to store history in, and lengthening `HISTORY_LENGTH` compresses different histories into the same slot. Like several people going for one seat, it ends in a mess, and the predictor cannot predict accurately either.

### 3. Not enough table capacity

Related to the point above: raising `HISTORY_LENGTH` without a matching increase in the predictor's size (set by `TABLE_BITS`) can leave the predictor with too little effective capacity to cover the larger number of history combinations. That limits its ability to learn and adapt to new patterns. Raising `HISTORY_LENGTH` without enlarging the predictor table is like having more and more files while the filing cabinet stays the same size: eventually it will not hold them, and finding a file takes longer too.

# My approach

Being lazy, I went for a relatively simple optimisation. The keywords are local branch predictor, bimodal predictor, G-share.

```c++
// my update
class my_update : public branch_update {
public:
	unsigned int index;
};

// Local Branch Predictor
class my_predictor : public branch_predictor{
public:
#define BHR_num 22 // (b.address & ((1<<PT_BITS)-1)) part of PC
#define PT_BITS 22
#define BMODAL_BITS 15  // define bimodal table bits

	unsigned char BimodalTable[1 << BMODAL_BITS];  // bimodal table

	my_update u;
	branch_info bi;
	unsigned int history;
	unsigned int BHRTable[BHR_num];
	unsigned char PTable[1<<PT_BITS];

	// initialize
	my_predictor (void) : history(0){
		// Initialize BHRTable with zeros
        for (int i = 0; i < BHR_num; i++) {
                BHRTable[i] = 0;
        }
        // Initialize PTable with zeros
		memset (PTable, 0, sizeof (PTable));
		// 4, mid of 0-7
    	memset(BimodalTable, 4, sizeof(BimodalTable));
	}

	branch_update *predict (branch_info &b) {
		bi = b;
		unsigned int bimodal_index = b.address & ((1 << BMODAL_BITS) - 1);
    	bool bimodal_prediction = (BimodalTable[bimodal_index] >> 1) & 1;
		if (b.br_flags & BR_CONDITIONAL) {
			u.index =
				BHRTable[history ^ (b.address & ((1<<PT_BITS)-1))];

			bool local_prediction = (PTable[u.index] >> 1) & 1;

			if (PTable[u.index] == 3 || PTable[u.index] == 4) { // unclear
				u.direction_prediction(bimodal_prediction);
			} else {
				u.direction_prediction(local_prediction);
			}
			} else {
				u.direction_prediction(true);
			}
			u.target_prediction (0);
		return &u;
	}

	void update (branch_update *u, bool taken, unsigned int target, branch_info &b) {
		if (bi.br_flags & BR_CONDITIONAL) {
			unsigned char *c = &PTable[((my_update*)u)->index];
			if (taken) {
				if (*c < 7) (*c)++;
			} else {
				if (*c > 0) (*c)--;
			}

			unsigned int bimodal_index = b.address & ((1 << BMODAL_BITS) - 1);
			if (taken) {
				if (BimodalTable[bimodal_index] < 7) BimodalTable[bimodal_index]++;
			} else {
				if (BimodalTable[bimodal_index] > 0) BimodalTable[bimodal_index]--;
			}

			BHRTable[history ^ (b.address & ((1<<PT_BITS)-1))] <<= 1;
			BHRTable[history ^ (b.address & ((1<<PT_BITS)-1))] |= taken;
			BHRTable[history ^ (b.address & ((1<<PT_BITS)-1))] &= (1<<14)-1;

			history <<= 1;
			history |= taken;
			history &= (1<<BHR_num)-1;
		}
	}

};
```

![BHR](/2024/04/12/Advanced-Architecture-CA1/BHR.png)

The MPKI I ended up with is 5.020.

```
traces/164.gzip/gzip.trace.bz2          	12.699
traces/175.vpr/vpr.trace.bz2            	12.147
traces/176.gcc/gcc.trace.bz2            	7.318
traces/181.mcf/mcf.trace.bz2            	14.578
traces/186.crafty/crafty.trace.bz2      	3.944
traces/197.parser/parser.trace.bz2      	8.373
traces/201.compress/compress.trace.bz2  	7.429
traces/202.jess/jess.trace.bz2          	0.980
traces/205.raytrace/raytrace.trace.bz2  	1.206
traces/209.db/db.trace.bz2              	3.559
traces/213.javac/javac.trace.bz2        	1.712
traces/222.mpegaudio/mpegaudio.trace.bz2	1.670
traces/227.mtrt/mtrt.trace.bz2          	1.325
traces/228.jack/jack.trace.bz2          	1.626
traces/252.eon/eon.trace.bz2            	0.898
traces/253.perlbmk/perlbmk.trace.bz2    	1.178
traces/254.gap/gap.trace.bz2            	2.423
traces/255.vortex/vortex.trace.bz2      	0.490
traces/256.bzip2/bzip2.trace.bz2        	0.091
traces/300.twolf/twolf.trace.bz2        	16.768
average MPKI: 5.020
```

First, I defined a branch history register table: an array whose every row is an int-sized BHR (branch history register). The BHR is what indexes the PT (pattern table). The point is that this amounts to keeping history per branch instruction, whereas the G-share in the example uses one single stream of history for every branch alike. Then I folded in G-share's idea as well, XORing a stream of history with the PC to specialise the PC, and used that as the index into the BHRT where the history is kept. That is about it for the broad optimisation.

For a further small optimisation I used the bimodal idea. What I set up is a 3-bit counter table (111 stands for strongly taken), so it counts up to 7. But there is a problem: at 011 (3) and 100 (4), our judgement is not all that strong. So I brought in a bimodal predictor, whose table records the index without regard to history at all and just puts the PC straight in. So we make a test: when the predictor that carries history predicts one of these borderline values, we should use the bimodal predictor instead.

-   The **bimodal table** (BimodalTable) is indexed by the low bits of the program counter alone. That makes the prediction depend on where the instruction is rather than on how it has executed. The bimodal table reflects the statistical tendency of branch behaviour at a particular program address.
-   The **local prediction table** (PTable) combines the global history with specific bits of the PC, usually XORed together to form the index. That captures patterns tied to past branch decisions, so the prediction can adapt as program behaviour changes.

A better approach would use TAMG, or some machine-learning method. Here is one TAMG implementation; if you are interested, read the paper and implement it: [https://github.com/Satjpatel/Branch-Predictor-Project/blob/fb34a61660f788c0339b68218e5c790d43d77e0e/Newr Final Infrastructure/cbp2-infrastructure-v3/src/my\_predictor.h#L37](https://github.com/Satjpatel/Branch-Predictor-Project/blob/fb34a61660f788c0339b68218e5c790d43d77e0e/Newr%20Final%20Infrastructure/cbp2-infrastructure-v3/src/my_predictor.h#L37)
