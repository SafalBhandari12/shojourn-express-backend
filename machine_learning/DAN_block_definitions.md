# DualAttentionNet (DAN) Block Definitions and Module Descriptions

This document provides detailed, modular, and code-aligned descriptions of each block in the DualAttentionNet (DAN) architecture. It is designed to be paired with code so that another LLM or researcher can generate a comprehensive research paper or documentation.

---

## 1. DAN-Stem

**Purpose:**

- Initial feature extractor for the network, capturing low-level spatial features from the input image.

**Structure:**

- `Conv2D(7x7)`: Large kernel convolution for broad spatial context.
- `BatchNormalization`: Stabilizes and accelerates training.
- `Swish`: Nonlinear activation function.
- `DAN-Channel-4`: Channel attention module (see below) with reduction ratio 4.

**Mathematical Formulation:**
Let $X$ be the input tensor.
\[
Y = \text{Swish}(\text{BN}(\text{Conv2D}\_{7x7}(X)))
\]
Channel attention is then applied:
\[
Y' = \text{DAN-Channel-4}(Y)
\]

**Implementation Note:**

- Used as the first block in the network pipeline.

---

## 2. DAN-Global

**Purpose:**

- Captures global spatial dependencies and enhances feature representation using efficient convolutions and channel attention.

**Structure:**

- `PWConv(1x1)`: Pointwise convolution for channel expansion.
- `BatchNormalization` + `Swish`
- `DWConv(3x3)`: Depthwise convolution for spatial feature extraction.
- `BatchNormalization` + `Swish`
- `DAN-Channel-8`: Channel attention module with reduction ratio 8 (see subsection 2.1).
- `PWConv(1x1)`: Pointwise convolution for channel projection.
- `BatchNormalization`

**Mathematical Formulation:**
Let $X$ be the input tensor, $F_{exp}$ the expansion factor.
\[
Y*1 = \text{Swish}(\text{BN}(\text{PWConv}*{1x1}(X))) \\
Y*2 = \text{Swish}(\text{BN}(\text{DWConv}*{3x3}(Y*1))) \\
Y_3 = \text{DAN-Channel-8}(Y_2) \\
Y_4 = \text{BN}(\text{PWConv}*{1x1}(Y_3))
\]

**Implementation Note:**

- Used for global feature extraction in the main body of the network.

### 2.1 DAN-Channel-4 and DAN-Channel-8 (within DAN-Global)

**Purpose:**

- Implements channel attention using a squeeze-and-excitation (SE) mechanism.

**Structure:**

- `Global Average Pooling`
- `Dense Layer (reduction)`
- `Swish`
- `Dense Layer (expansion)`
- `Sigmoid + Reshape`
- `Multiply` (scales original features)

**Mathematical Formulation:**
Let $X$ be the input tensor with $C$ channels, $r$ the reduction ratio (4 or 8):
\[
s = \text{GlobalAvgPool}(X) \\
s = \text{Swish}(\text{Dense}\_{C/r}(s)) \\
s = \sigma(\text{Dense}\_C(s)) \\
s = \text{Reshape}(s) \\
Y = X \odot s
\]

**Implementation Note:**

- Used throughout the network for channel recalibration.

---

## 3. DAN-Local

**Purpose:**

- Models local dependencies using window-based self-attention (transformer) mechanisms, enhanced with gating and channel attention.

**Structure:**

- `LayerNorm`
- `Window Partition (7x7)` (see subsection 3.2)
- `GMHA (Gated Multi-Head Attention)`
- `Window Reverse` (see subsection 3.2)
- `LayerNorm`
- `MLP Block` (see subsection 3.1)
- `DAN-Channel-4`
- `Drop Path` (stochastic depth regularization after attention and MLP)

**Mathematical Formulation:**
Let $X$ be the input tensor.
\[
Y_1 = \text{LayerNorm}(X) \\
Y_2 = \text{WindowPartition}(Y_1) \\
Y_3 = \text{GMHA}(Y_2) \\
Y_4 = \text{WindowReverse}(Y_3) \\
Y_5 = \text{DropPath}(Y_4) + X \\
Y_6 = \text{LayerNorm}(Y_5) \\
Y_7 = \text{MLP}(Y_6) \\
Y_8 = \text{DAN-Channel-4}(Y_7) \\
Y_9 = \text{DropPath}(Y_8) + Y_5
\]

**Implementation Note:**

- Used for local feature modeling with transformer-style attention.

### 3.1 MLP Block (within DAN-Local)

**Purpose:**

- Provides nonlinearity and channel mixing after attention in transformer blocks.

**Structure:**

- `Dense Layer (expansion)`
- `GELU Activation`
- `Dropout`
- `Dense Layer (projection)`
- `Dropout`

**Mathematical Formulation:**
\[
Y*1 = \text{GELU}(\text{Dense}*{expand}(X)) \\
Y*2 = \text{Dropout}(Y_1) \\
Y_3 = \text{Dense}*{project}(Y_2) \\
Y_4 = \text{Dropout}(Y_3)
\]

**Implementation Note:**

- Used in DAN-Local after attention.

### 3.2 Window Partition and Window Reverse (within DAN-Local)

**Purpose:**

- Enables local self-attention by splitting the feature map into non-overlapping windows and reconstructing it after attention.

**Structure:**

- `Window Partition`: Pads and reshapes the input to extract windows of fixed size.
- `Window Reverse`: Reconstructs the original spatial layout from the processed windows, removing any padding.

**Mathematical Formulation:**

- Partition: $X \rightarrow \text{Windows}$
- Reverse: $\text{Windows} \rightarrow X$

**Implementation Note:**

- Used in DAN-Local for window-based processing.

---

## 4. DownSample Block

**Purpose:**

- Reduces spatial resolution while increasing channel depth, enabling hierarchical feature extraction.

**Structure:**

- `Conv2D(3x3, stride=2)`: Downsampling convolution.
- `BatchNormalization`
- `Swish`
- `DAN-Channel-4`

**Mathematical Formulation:**
\[
Y = \text{Swish}(\text{BN}(\text{Conv2D}\_{3x3, s=2}(X))) \\
Y' = \text{DAN-Channel-4}(Y)
\]

**Implementation Note:**

- Used between stages to reduce feature map size.

---

## 5. GMHA (Gated Multi-Head Attention)

**Purpose:**

- Enhances standard multi-head self-attention by introducing a gating mechanism.

**Structure:**

- `Q, K, V Projections` (linear or dense layers)
- `Dot Product Attention` with scaling by $1/\sqrt{d_k}$
- `Softmax` normalization
- `Weighted Sum` with values (V)
- `Dense Layer` (projection)
- `Sigmoid Gate` (learned gating vector)
- `Elementwise Multiply` (modulates attention output)

**Mathematical Formulation:**
\[
A = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right) \\
O = AV \\
G = \sigma(O W_g) \\
Y = O \odot G
\]

**Implementation Note:**

- Used in DAN-Local for window-based attention with gating.

---

## Legend

- **PWConv(1x1):** Pointwise (1×1) convolution
- **DWConv(3x3):** Depthwise (3×3) convolution
- **BN:** Batch normalization
- **Swish:** Swish activation function
- **GELU:** Gaussian Error Linear Unit activation
- **Multiply:** Elementwise multiplication
- **Drop Path:** Stochastic depth regularization
- **Window Partition/Reverse:** Splitting and reconstructing feature maps for local attention
- **Dot Product:** Matrix multiplication for attention score computation
- **Dense Layer:** Fully connected (linear) layer
- **Sigmoid:** Sigmoid activation function
- **GlobalAvgPool:** Global average pooling

---

**This file is designed for direct use with code and is ready for another LLM or researcher to generate a full research paper or technical documentation.**
