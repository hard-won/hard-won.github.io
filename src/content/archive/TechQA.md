---
title: "如何提问技术问题"
date: 2024-06-02T03:30:22-07:00
slug: "TechQA"
lang: zh
categories: ["技术", "Soft Skill"]
tags: []
originalUrl: "/2024/06/02/TechQA/"
---
# 如何在编程社区中提出有效问题

在编程的过程中，你可能会遇到各种难题，比如程序无法正常工作、无法理解某个算法的实现等等。在这些情况下，你很可能会在线上社区如Stack Overflow、Discord、Reddit、Facebook群组或者直接向朋友求助。为了获得有效的帮助，提出一个清晰易读、易理解的问题是至关重要的。以下是一些建议，帮助你在编程社区中提出有效问题。

## 提供上下文

首先，你需要提供足够的上下文。上下文有助于别人更好地理解你的问题，因为他们可以知道你所处的情境以及可能影响回答的参数。开发者可能无法猜到你使用的编程语言或框架，也可能无法仅通过你提供的代码示例来理解你的环境设置。

示例：

```tex
I am using C++ 1999 and trying to utilize the auto keyword which is available in C++ 2011. Here is the error I encountered:
```

## 概述你的问题

总结你的问题并用标题表述出来。就像在Stack Overflow上，每个问题都应该有一个能传达基本要点的标题。标题应尽量简短，但要足够详细，使人们仅通过阅读标题就能判断他们是否能帮助你解决问题。

示例：

```tex
Title: Error using auto keyword in C++ 1999

Content: I am trying to use the auto keyword in C++ 1999, but I get a compilation error. Here is my code:
```

## 创建最小可复现示例

如果你的问题依赖于代码，请始终包含一个最小可复现示例。这可以是完整的GitHub存储库、gist，甚至只是几行代码。你不需要复制整个项目或存储库，只需添加别人需要帮助你的关键部分。

示例：

```cpp
#include <iostream>

int main() {
    auto x = 5; // error: 'auto' not allowed in C++ 1999
    std::cout << x << std::endl;
    return 0;
}
```

## 提供限制和约束

总是提及任何限制和约束。不这样做有时会导致答案被拒绝，因为答案超出了你没有提到的某些约束。

示例：

```tex
This is for a school project, and I am not allowed to use any features beyond C++ 1999.
```

## 避免使用代码截图

如果你在社交网络上发布代码截图，这些图片可能会被压缩，变得难以阅读。糟糕的图像质量会阻碍开发者复制你的代码，使他们不得不自己手动输入代码来开始帮助你，这既耗时又可能导致他们放弃回答。

## 分享你已经尝试过的内容

列出你已经尝试过的内容。你不想在提出问题时显得懒惰。你的最后尝试可能距离解决问题只有一步之遥。如果没有列出你尝试过的内容，别人会从头开始调试问题，这会浪费时间和精力。

示例：

```
I have tried compiling the code with the following flags: -std=c++11, but it still doesn't work with my current setup.
```

## 保持样本数据的小巧

通常，我们需要样本数据来测试代码。提供简化的样本数据可以使调试更容易。

示例：

```tex
Here is a minimal dataset I am using for testing:
{
    "key1": "value1",
    "key2": "value2"
}
```

## 格式化、Static Check和文档化你的代码

没有人愿意阅读格式不良、变量命名不一致或风格糟糕的代码。遵循流行的约定，使用描述性名称，并确保有良好的文档说明函数的用途、变量的用途和使用方式。

示例：

```cpp
function calculateSum(int a, int b) {
    int sum = a + b;
    return sum;
}
```

## 添加摘要

为了使问题更简洁，如果问题过长，可以在开始部分添加摘要。这将帮助读者快速了解你的问题内容，决定是否继续阅读。

示例：

```
Summary: I am encountering an error using the auto keyword in C++ 1999. The detailed question is as follows:
```

## 尊重他人

记住，帮助你的人并不是有偿服务，他们是付出时间和精力来帮助你。尊重他们的隐私，给他们空间，不要过分催促。

---

When asking technical questions in a tech company, there are best practices and templates that can ensure your question is clear, understandable, and receives effective answers. Here are some key points and example templates:

# Best Practices for Asking Technical Questions

1.  **Create a Minimal Reproducible Example**:
    
    -   Include the smallest amount of code necessary to demonstrate the problem.
    -   Ensure the example is complete, including all necessary imports and modules.
    -   Keep the example concise and avoid irrelevant code.
2.  **Include Any Restrictions and Constraints**:
    
    -   Clearly list any constraints or restrictions that apply to your problem to avoid irrelevant answers.
    -   Explain the reasons for these constraints if possible.
3.  **Avoid Using Code Screenshots**:
    
    -   Share code in text form to facilitate copying and debugging.
    -   Use online code hosting platforms like GitHub Gist, CodePen, etc., if needed.
4.  **List What You’ve Already Tried**:
    
    -   Detail the solutions you’ve already attempted to prevent duplication of effort.
5.  **Keep Sample Data Small**:
    
    -   Provide only the necessary data relevant to the problem.
6.  **Format, Lint, and Document Your Code**:
    
    -   Follow popular coding conventions to ensure readability.
    -   Use tools like linters to check your code.
7.  **Grammar-Check Your Question**:
    
    -   Use tools like Grammarly to ensure your question is easy to read.

## Question Templates

### Example Template 1:

````
### Problem Description
I encountered an issue while using [specific technology/library]. The specific problem is [briefly describe the problem].

### Minimal Reproducible Example
```python
import example

def sample_function():
    # Example code
    pass
````

#### Constraints

-   Cannot use \[certain methods/libraries\]
-   Must run in \[specific environment\]

#### Solutions I’ve Tried

-   Attempted solution 1: \[describe\]
-   Attempted solution 2: \[describe\]

#### Expected Result

-   The expected output or behavior

#### Actual Result

-   The actual output or behavior

#### Environment

-   Operating System: \[describe\]
-   Python version: \[describe\]
-   Libraries and versions: \[describe\]

I hope to get a solution, thank you!

### Example Template 2:

#### Problem Description

I am facing an issue in \[project name\] when using \[technology name\]. The specific issue is \[describe the problem\].

#### Steps to Reproduce

1.  Perform \[step 1\]
2.  Perform \[step 2\]
3.  The issue appears

#### Sample Code

```javascript
function example() {
    // Sample code
}
```

#### Constraints

-   Only allowed to use \[specific technologies/methods\]
-   Must adhere to \[specific standards or guidelines\]

#### Attempted Solutions

-   Tried solution 1: \[describe\]
-   Tried solution 2: \[describe\]

#### Current Environment

-   Operating System: \[describe\]
-   Browser and version: \[describe\]
-   Relevant libraries and versions: \[describe\]
