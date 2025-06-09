import os
import pickle
import matplotlib.pyplot as plt
import tensorflow as tf
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.layers import (
    Input,
    Conv2D,
    DepthwiseConv2D,
    BatchNormalization,
    Activation,
    GlobalAveragePooling2D,
    GlobalAveragePooling1D,
    Dropout,
    Dense,
    Reshape,
    Multiply,
    Add,
    LayerNormalization,
    Lambda,
)
from tensorflow.keras.models import Model, load_model
from tensorflow.keras.callbacks import ReduceLROnPlateau, EarlyStopping, ModelCheckpoint
from tensorflow.python.framework.convert_to_constants import (
    convert_variables_to_constants_v2,
)
from google.colab import drive

# Mount Google Drive
drive.mount("/content/drive")

# -----------------------------
# Constants
# -----------------------------
IMG_SIZE = (224, 224)
BATCH_SIZE = 24
EPOCHS = 200
NUM_CLASSES = 11
DATASET_PATH = "./new_dataset"
MODEL_SAVE_DIR = (
    "/content/drive/MyDrive/hybrid_multi_head"  # Changed to Google Drive path
)
os.makedirs(MODEL_SAVE_DIR, exist_ok=True)


# -----------------------------
# FLOPs Calculation
# -----------------------------
def get_flops(model):
    try:

        @tf.function
        def model_forward(x):
            return model(x)

        input_shape = [1] + list(model.input_shape[1:])
        concrete_func = model_forward.get_concrete_function(
            tf.TensorSpec(input_shape, model.input.dtype)
        )
        frozen_func = convert_variables_to_constants_v2(concrete_func)
        graph_def = frozen_func.graph.as_graph_def()
        with tf.Graph().as_default() as graph:
            tf.import_graph_def(graph_def, name="")
            run_meta = tf.compat.v1.RunMetadata()
            opts = tf.compat.v1.profiler.ProfileOptionBuilder.float_operation()
            flops = tf.compat.v1.profiler.profile(
                graph=graph, run_meta=run_meta, cmd="op", options=opts
            )
            return flops.total_float_ops
    except Exception as e:
        print(f"Could not compute FLOPs: {e}")
        return None


# -----------------------------
# Modern Stem Block
# -----------------------------
def efficient_stem(x, filters, name="stem"):
    x = Conv2D(
        filters, 7, strides=2, padding="same", use_bias=False, name=f"{name}_conv"
    )(x)
    x = BatchNormalization(name=f"{name}_bn")(x)
    x = Activation("swish", name=f"{name}_act")(x)

    se = GlobalAveragePooling2D(name=f"{name}_se_gap")(x)
    se = Dense(filters // 4, activation="swish", name=f"{name}_se_fc1")(se)
    se = Dense(filters, activation="sigmoid", name=f"{name}_se_fc2")(se)
    se = Reshape((1, 1, filters))(se)
    x = Multiply(name=f"{name}_se_mul")([x, se])

    return x


# -----------------------------
# Relative Positional Encoding
# -----------------------------
class RelativePositionalEncoding(tf.keras.layers.Layer):
    def __init__(self, window_size, num_heads, **kwargs):
        super().__init__(**kwargs)
        self.window_size = window_size
        self.num_heads = num_heads

    def build(self, input_shape):
        ws = self.window_size
        coords_h = tf.range(ws)
        coords_w = tf.range(ws)
        coords = tf.stack(tf.meshgrid(coords_h, coords_w, indexing="ij"))
        coords_flat = tf.reshape(coords, [2, -1])
        rel = coords_flat[:, :, None] - coords_flat[:, None, :]
        rel = tf.transpose(rel, [1, 2, 0])
        rel = rel + [ws - 1, ws - 1]
        rel = rel * [2 * ws - 1, 1]
        idx = tf.reduce_sum(rel, axis=-1)

        self.relative_position_bias_table = self.add_weight(
            shape=((2 * ws - 1) * (2 * ws - 1), self.num_heads),
            initializer=tf.keras.initializers.TruncatedNormal(stddev=0.02),
            name="relative_position_bias_table",
        )
        self.relative_position_index = tf.constant(idx, dtype=tf.int32)

    def call(self, x):
        # unused here; real bias should be injected inside attention scores
        return x


# -----------------------------
# Gated Multi‑Head Attention (fixed)
# -----------------------------
class GatedMultiHeadAttention(tf.keras.layers.Layer):
    def __init__(self, dim, num_heads, qkv_bias=True, dropout_rate=0.0, **kwargs):
        super().__init__(**kwargs)
        self.dim = dim
        self.num_heads = num_heads
        self.scale = tf.math.rsqrt(tf.cast(dim // num_heads, tf.float32))
        self.use_bias = qkv_bias
        self.dropout_rate = dropout_rate

    def build(self, input_shape):
        self.qkv = self.add_weight(
            shape=(input_shape[-1], self.dim * 3),
            initializer="glorot_uniform",
            name="qkv",
            trainable=True,
        )
        if self.use_bias:
            self.qkv_bias = self.add_weight(
                shape=(self.dim * 3,),
                initializer="zeros",
                name="qkv_bias",
                trainable=True,
            )
        self.gate = self.add_weight(
            shape=(input_shape[-1], self.dim),
            initializer="glorot_uniform",
            name="gate",
            trainable=True,
        )
        self.proj = self.add_weight(
            shape=(self.dim, self.dim),
            initializer="glorot_uniform",
            name="proj",
            trainable=True,
        )
        self.dropout = Dropout(self.dropout_rate)
        super().build(input_shape)

    def call(self, x):
        B = tf.shape(x)[0]
        N = tf.shape(x)[1]
        C = tf.shape(x)[2]

        # QKV with reduced computation
        qkv = tf.matmul(x, self.qkv)
        if self.use_bias:
            qkv = tf.nn.bias_add(qkv, self.qkv_bias)
        qkv = tf.reshape(qkv, [B, N, 3, self.num_heads, C // self.num_heads])
        qkv = tf.transpose(qkv, [2, 0, 3, 1, 4])
        q, k, v = qkv[0], qkv[1], qkv[2]

        # Efficient attention computation
        attn = tf.matmul(q, k, transpose_b=True) * self.scale
        attn = tf.nn.softmax(attn, axis=-1)
        attn = self.dropout(attn)

        x = tf.matmul(attn, v)
        x = tf.transpose(x, [0, 2, 1, 3])
        x = tf.reshape(x, [B, N, C])
        x = tf.matmul(x, self.proj)
        x = self.dropout(x)

        # Simplified gating
        gate = tf.nn.sigmoid(tf.matmul(x, self.gate))
        return x * gate

    def compute_output_shape(self, input_shape):
        return input_shape

    def get_config(self):
        config = super().get_config()
        config.update(
            {
                "dim": self.dim,
                "num_heads": self.num_heads,
                "qkv_bias": self.use_bias,
                "dropout_rate": self.dropout_rate,
            }
        )
        return config


# -----------------------------
# Enhanced Swin Transformer Block
# -----------------------------
class EnhancedSwinTransformerBlock(tf.keras.layers.Layer):
    def __init__(
        self,
        dim,
        num_heads,
        window_size=7,
        shift_size=0,
        mlp_ratio=4.0,
        qkv_bias=True,
        dropout_rate=0.0,
        drop_path_rate=0.0,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.dim = dim
        self.num_heads = num_heads
        self.window_size = window_size

        self.norm1 = LayerNormalization(epsilon=1e-5)
        self.norm2 = LayerNormalization(epsilon=1e-5)
        self.partition = WindowPartition(window_size)
        self.reverse = WindowReverse(window_size)

        self.attn = GatedMultiHeadAttention(dim, num_heads, qkv_bias, dropout_rate)
        self.pos_encoding = RelativePositionalEncoding(window_size, num_heads)

        self.drop_path = Dropout(drop_path_rate)
        self.mlp = tf.keras.Sequential(
            [
                Dense(int(dim * mlp_ratio)),
                Activation(tf.nn.gelu),
                Dropout(dropout_rate),
                Dense(dim),
                Dropout(dropout_rate),
            ]
        )
        self.se = tf.keras.Sequential(
            [
                GlobalAveragePooling2D(),
                Dense(dim // 4, activation="swish"),
                Dense(dim, activation="sigmoid"),
                Reshape((1, 1, dim)),
            ]
        )

    def build(self, input_shape):
        super().build(input_shape)
        self.norm1.build(input_shape)
        self.attn.build((None, None, self.dim))
        self.norm2.build(input_shape)
        self.mlp.build(input_shape)
        self.se.build(input_shape)

    def call(self, x):
        H, W = tf.shape(x)[1], tf.shape(x)[2]
        sc1 = x

        # norm + partition
        x = self.norm1(x)
        windows, H0, W0, ph, pw = self.partition(x)
        Bn = tf.shape(windows)[0]
        flat = tf.reshape(windows, [Bn, self.window_size * self.window_size, self.dim])

        # attention
        attn_out = self.attn(flat)

        windows_attn = tf.reshape(
            attn_out, [Bn, self.window_size, self.window_size, self.dim]
        )
        x = self.reverse(windows_attn, H0, W0, ph, pw)

        # Apply drop path with proper shape
        drop_path_mask = tf.random.uniform(tf.shape(x)) < self.drop_path.rate
        x = tf.where(drop_path_mask, x, 0.0)
        x = sc1 + x

        # MLP + SE
        sc2 = x
        x = self.norm2(x)
        x = self.mlp(x)
        se = self.se(x)
        x = x * se

        # Apply drop path with proper shape
        drop_path_mask = tf.random.uniform(tf.shape(x)) < self.drop_path.rate
        x = tf.where(drop_path_mask, x, 0.0)
        x = sc2 + x

        return x


# -----------------------------
# Final Multi‑Head Attention & Helpers
# -----------------------------
class FinalMultiHeadAttention(tf.keras.layers.Layer):
    def __init__(self, dim, num_heads, dropout_rate=0.0, **kwargs):
        super().__init__(**kwargs)
        self.dim = dim
        self.num_heads = num_heads
        self.scale = tf.math.rsqrt(tf.cast(dim // num_heads, tf.float32))
        self.qkv = Dense(dim * 3)
        self.proj = Dense(dim)
        self.dropout = Dropout(dropout_rate)

    def call(self, x):
        B, N, C = tf.shape(x)[0], tf.shape(x)[1], tf.shape(x)[2]
        qkv = self.qkv(x)
        qkv = tf.reshape(qkv, [B, N, 3, self.num_heads, C // self.num_heads])
        qkv = tf.transpose(qkv, [2, 0, 3, 1, 4])
        q, k, v = qkv[0], qkv[1], qkv[2]

        attn = tf.matmul(q, k, transpose_b=True) * self.scale
        attn = tf.nn.softmax(attn, axis=-1)
        attn = self.dropout(attn)

        x = tf.matmul(attn, v)
        x = tf.transpose(x, [0, 2, 1, 3])
        x = tf.reshape(x, [B, N, C])
        x = self.proj(x)
        return self.dropout(x)


def inverted_residual_block(
    x,
    filters_in,
    filters_out,
    expansion_ratio=2,
    kernel_size=3,
    strides=1,
    use_ecca=True,
    name="ir_block",
):
    sc = x
    expanded = filters_in * expansion_ratio

    # Use depthwise separable convolution for efficiency
    x = Conv2D(expanded, 1, padding="same", use_bias=False, name=f"{name}_expand")(x)
    x = BatchNormalization(name=f"{name}_expand_bn")(x)
    x = Activation("swish", name=f"{name}_expand_act")(x)

    # Use depthwise convolution
    x = DepthwiseConv2D(
        kernel_size, strides=strides, padding="same", name=f"{name}_dw"
    )(x)
    x = BatchNormalization(name=f"{name}_dw_bn")(x)
    x = Activation("swish", name=f"{name}_dw_act")(x)

    if use_ecca:
        # Simplified ECCA block
        avg = GlobalAveragePooling2D(name=f"{name}_avg_pool")(x)
        avg = Dense(expanded // 8, activation="swish", name=f"{name}_fc1_avg")(
            avg
        )  # Reduced from //12
        avg = Dense(expanded, activation="sigmoid", name=f"{name}_fc2_avg")(avg)
        ch = Reshape((1, 1, expanded))(avg)
        x = Multiply(name=f"{name}_channel_attn")([x, ch])

    x = Conv2D(filters_out, 1, padding="same", use_bias=False, name=f"{name}_project")(
        x
    )
    x = BatchNormalization(name=f"{name}_project_bn")(x)

    if strides == 1 and filters_in == filters_out:
        x = Add(name=f"{name}_add")([sc, x])
    return x


class WindowPartition(tf.keras.layers.Layer):
    def __init__(self, window_size, **kwargs):
        super().__init__(**kwargs)
        self.window_size = window_size

    def call(self, x):
        B, H, W, C = tf.shape(x)[0], tf.shape(x)[1], tf.shape(x)[2], tf.shape(x)[3]
        pad_h = (self.window_size - H % self.window_size) % self.window_size
        pad_w = (self.window_size - W % self.window_size) % self.window_size
        x_pad = tf.pad(x, [[0, 0], [0, pad_h], [0, pad_w], [0, 0]])
        new_H, new_W = H + pad_h, W + pad_w

        x_rs = tf.reshape(
            x_pad,
            [
                B,
                new_H // self.window_size,
                self.window_size,
                new_W // self.window_size,
                self.window_size,
                C,
            ],
        )
        x_tr = tf.transpose(x_rs, [0, 1, 3, 2, 4, 5])
        windows = tf.reshape(x_tr, [-1, self.window_size, self.window_size, C])
        return windows, H, W, pad_h, pad_w


class WindowReverse(tf.keras.layers.Layer):
    def __init__(self, window_size, **kwargs):
        super().__init__(**kwargs)
        self.window_size = window_size

    def call(self, windows, H, W, pad_h, pad_w):
        ws = self.window_size
        B = tf.shape(windows)[0] // (((H + pad_h) * (W + pad_w)) // (ws * ws))
        x_rs = tf.reshape(
            windows,
            [B, (H + pad_h) // ws, (W + pad_w) // ws, ws, ws, tf.shape(windows)[-1]],
        )
        x_tr = tf.transpose(x_rs, [0, 1, 3, 2, 4, 5])
        x = tf.reshape(x_tr, [B, H + pad_h, W + pad_w, tf.shape(windows)[-1]])
        return x[:, :H, :W, :]


def downsampling_block(x, filters, name="downsample"):
    """Efficient downsampling block with channel attention"""
    # Main path
    x = Conv2D(
        filters, 3, strides=2, padding="same", use_bias=False, name=f"{name}_conv"
    )(x)
    x = BatchNormalization(name=f"{name}_bn")(x)
    x = Activation("swish", name=f"{name}_act")(x)

    # Channel attention
    se = GlobalAveragePooling2D(name=f"{name}_se_gap")(x)
    se = Dense(filters // 4, activation="swish", name=f"{name}_se_fc1")(se)
    se = Dense(filters, activation="sigmoid", name=f"{name}_se_fc2")(se)
    se = Reshape((1, 1, filters))(se)
    x = Multiply(name=f"{name}_se_mul")([x, se])

    return x


def build_hybrid_model(input_shape=(224, 224, 3), num_classes=12):
    inp = Input(shape=input_shape)
    x = efficient_stem(inp, 24, name="stem")  # Reduced from 32 to 24

    # Stage progression with reduced channels and heads
    stages = [
        (24, 32, 2, 0.1),  # Stage 1: 24->32 channels, 2 heads
        (32, 48, 3, 0.2),  # Stage 2: 32->48 channels, 3 heads
        (48, 64, 4, 0.3),  # Stage 3: 48->64 channels, 4 heads
        (64, 96, 6, 0.4),  # Stage 4: 64->96 channels, 6 heads
    ]

    for i, (in_c, out_c, heads, dpr) in enumerate(stages):
        # Use stride=2 in first block of each stage
        stride = 2 if i > 0 else 1

        # Add downsampling block before inverted residual
        if stride == 2:
            x = downsampling_block(x, out_c, name=f"stage{i+1}_down")

        x = inverted_residual_block(
            x,
            in_c,
            out_c,
            expansion_ratio=4,  # Reduced from 6 to 4
            strides=1,  # Keep stride=1 since downsampling handles it
            use_ecca=True,
            name=f"stage{i+1}_ir",
        )
        x = EnhancedSwinTransformerBlock(
            dim=out_c,
            num_heads=heads,
            window_size=7,
            drop_path_rate=dpr,
            name=f"stage{i+1}_swin",
        )(x)

    # Final classification layers
    x = GlobalAveragePooling2D()(x)
    x = Reshape((1, 96))(x)  # Changed to match final stage channels

    # Add multi-head attention before final layers
    x = FinalMultiHeadAttention(dim=96, num_heads=6, dropout_rate=0.1)(x)

    x = tf.keras.layers.Flatten()(x)
    x = Dropout(0.3)(x)
    x = Dense(192, activation="swish")(x)  # Reduced from 256 to 192
    x = Dropout(0.2)(x)
    out = Dense(num_classes, activation="softmax")(x)

    return Model(inp, out, name="EnhancedSwinECCA_Net")


train_datagen = ImageDataGenerator(
    rescale=1.0 / 255,
    rotation_range=30,
    width_shift_range=0.3,
    height_shift_range=0.3,
    shear_range=0.3,
    zoom_range=0.3,
    horizontal_flip=True,
    brightness_range=[0.8, 1.2],
    fill_mode="nearest",
)
test_datagen = ImageDataGenerator(rescale=1.0 / 255)


class SaveHistoryCallback(tf.keras.callbacks.Callback):
    def __init__(self, history_path, history_data=None, initial_lr=1e-3):
        super().__init__()
        self.history_path = history_path
        self.history_data = history_data or {
            "accuracy": [],
            "loss": [],
            "val_accuracy": [],
            "val_loss": [],
            "learning_rate": [initial_lr],
            "f1_score": [],
            "val_f1_score": [],
            "sensitivity": [],
            "val_sensitivity": [],
            "specificity": [],
            "val_specificity": [],
            "precision": [],
            "val_precision": [],
            "recall": [],
            "val_recall": [],
        }

    def on_epoch_end(self, epoch, logs=None):
        logs = logs or {}
        for metric in [
            "accuracy",
            "loss",
            "val_accuracy",
            "val_loss",
            "f1_score",
            "val_f1_score",
            "sensitivity",
            "val_sensitivity",
            "specificity",
            "val_specificity",
            "precision",
            "val_precision",
            "recall",
            "val_recall",
        ]:
            if metric in logs:
                self.history_data[metric].append(logs[metric])
        lr = float(tf.keras.backend.get_value(self.model.optimizer.learning_rate))
        self.history_data["learning_rate"].append(lr)
        with open(self.history_path, "wb") as f:
            pickle.dump(self.history_data, f)


def focal_loss_with_smoothing(y_true, y_pred, gamma=2.0, alpha=0.25, smoothing=0.1):
    sm = y_true * (1.0 - smoothing) + smoothing / NUM_CLASSES
    y_pred = tf.clip_by_value(y_pred, 1e-7, 1 - 1e-7)
    ce = -sm * tf.math.log(y_pred)
    w = tf.pow(1.0 - y_pred, gamma) * alpha
    return tf.reduce_sum(w * ce, axis=-1)


# Add these custom metrics after the imports
class Sensitivity(tf.keras.metrics.Metric):
    def __init__(self, name="sensitivity", **kwargs):
        super().__init__(name=name, **kwargs)
        self.true_positives = self.add_weight(name="tp", initializer="zeros")
        self.false_negatives = self.add_weight(name="fn", initializer="zeros")

    def update_state(self, y_true, y_pred, sample_weight=None):
        y_pred = tf.argmax(y_pred, axis=1)
        y_true = tf.argmax(y_true, axis=1)
        values = tf.equal(y_true, y_pred)
        values = tf.cast(values, self.dtype)
        if sample_weight is not None:
            sample_weight = tf.cast(sample_weight, self.dtype)
            values = tf.multiply(values, sample_weight)
        self.true_positives.assign_add(tf.reduce_sum(values))
        self.false_negatives.assign_add(tf.reduce_sum(1 - values))

    def result(self):
        return self.true_positives / (self.true_positives + self.false_negatives)

    def reset_states(self):
        self.true_positives.assign(0)
        self.false_negatives.assign(0)


class Specificity(tf.keras.metrics.Metric):
    def __init__(self, name="specificity", **kwargs):
        super().__init__(name=name, **kwargs)
        self.true_negatives = self.add_weight(name="tn", initializer="zeros")
        self.false_positives = self.add_weight(name="fp", initializer="zeros")

    def update_state(self, y_true, y_pred, sample_weight=None):
        y_pred = tf.argmax(y_pred, axis=1)
        y_true = tf.argmax(y_true, axis=1)
        values = tf.not_equal(y_true, y_pred)
        values = tf.cast(values, self.dtype)
        if sample_weight is not None:
            sample_weight = tf.cast(sample_weight, self.dtype)
            values = tf.multiply(values, sample_weight)
        self.true_negatives.assign_add(tf.reduce_sum(values))
        self.false_positives.assign_add(tf.reduce_sum(1 - values))

    def result(self):
        return self.true_negatives / (self.true_negatives + self.false_positives)

    def reset_states(self):
        self.true_negatives.assign(0)
        self.false_positives.assign(0)


class F1Score(tf.keras.metrics.Metric):
    def __init__(self, name="f1_score", **kwargs):
        super().__init__(name=name, **kwargs)
        self.precision = tf.keras.metrics.Precision()
        self.recall = tf.keras.metrics.Recall()

    def update_state(self, y_true, y_pred, sample_weight=None):
        self.precision.update_state(y_true, y_pred, sample_weight)
        self.recall.update_state(y_true, y_pred, sample_weight)

    def result(self):
        p = self.precision.result()
        r = self.recall.result()
        return 2 * ((p * r) / (p + r + tf.keras.backend.epsilon()))

    def reset_states(self):
        self.precision.reset_states()
        self.recall.reset_states()


def train_model(split, resume=False):
    print(f"Training model for split: {split}")
    train_dir = os.path.join(DATASET_PATH, split, "train")
    test_dir = os.path.join(DATASET_PATH, split, "test")

    train_gen = train_datagen.flow_from_directory(
        train_dir, target_size=IMG_SIZE, batch_size=BATCH_SIZE, class_mode="categorical"
    )
    test_gen = test_datagen.flow_from_directory(
        test_dir, target_size=IMG_SIZE, batch_size=BATCH_SIZE, class_mode="categorical"
    )

    last_path = os.path.join(MODEL_SAVE_DIR, f"last_model_{split}.h5")
    best_path = os.path.join(MODEL_SAVE_DIR, f"best_model_{split}.h5")
    hist_path = os.path.join(MODEL_SAVE_DIR, f"history_{split}.pkl")

    history_data, init_lr, init_epoch = None, 1e-3, 0

    # Define custom objects for model loading
    custom_objects = {
        "focal_loss_with_smoothing": focal_loss_with_smoothing,
        "GatedMultiHeadAttention": GatedMultiHeadAttention,
        "EnhancedSwinTransformerBlock": EnhancedSwinTransformerBlock,
        "FinalMultiHeadAttention": FinalMultiHeadAttention,
        "WindowPartition": WindowPartition,
        "WindowReverse": WindowReverse,
        "RelativePositionalEncoding": RelativePositionalEncoding,
        "Sensitivity": Sensitivity,
        "Specificity": Specificity,
        "F1Score": F1Score,
    }

    # Define metrics
    metrics = [
        "accuracy",
        Sensitivity(),
        Specificity(),
        F1Score(),
        tf.keras.metrics.Precision(),
        tf.keras.metrics.Recall(),
    ]

    if resume and os.path.exists(last_path) and os.path.exists(hist_path):
        with open(hist_path, "rb") as f:
            history_data = pickle.load(f)
        init_lr = float(history_data["learning_rate"][-1])
        model = load_model(
            last_path,
            custom_objects=custom_objects,
        )
        # Recompile the model with the correct learning rate and metrics
        model.compile(
            optimizer=Adam(init_lr), loss=focal_loss_with_smoothing, metrics=metrics
        )
        init_epoch = len(history_data["accuracy"])
        print(f"Resuming from epoch {init_epoch}, lr={init_lr:.2e}")
    else:
        model = build_hybrid_model(num_classes=NUM_CLASSES)
        model.compile(
            optimizer=Adam(init_lr), loss=focal_loss_with_smoothing, metrics=metrics
        )

    flops = get_flops(model)
    if flops is not None:
        print(f"Total FLOPs: {flops:,}")

    callbacks = [
        SaveHistoryCallback(hist_path, history_data, initial_lr=init_lr),
        ModelCheckpoint(last_path, save_best_only=False, verbose=1),
        ModelCheckpoint(
            best_path,
            save_best_only=True,
            monitor="val_accuracy",
            mode="max",
            verbose=1,
        ),
        ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=3, min_lr=1e-20, verbose=1
        ),
        EarlyStopping(monitor="val_loss", patience=10, verbose=1),
    ]

    history = model.fit(
        train_gen,
        validation_data=test_gen,
        epochs=EPOCHS,
        initial_epoch=init_epoch,
        callbacks=callbacks,
    )

    print(f"Training complete. Last checkpoint: {last_path}, Best: {best_path}")

    # Load the complete history from pickle file
    with open(hist_path, "rb") as f:
        h = pickle.load(f)

    # Plot training history
    plt.figure(figsize=(15, 10))

    # Plot accuracy metrics
    plt.subplot(2, 2, 1)
    plt.plot(h["accuracy"], label="Train Accuracy")
    plt.plot(h["val_accuracy"], label="Val Accuracy")
    plt.title("Model Accuracy")
    plt.xlabel("Epoch")
    plt.ylabel("Accuracy")
    plt.legend()

    # Plot loss
    plt.subplot(2, 2, 2)
    plt.plot(h["loss"], label="Train Loss")
    plt.plot(h["val_loss"], label="Val Loss")
    plt.title("Model Loss")
    plt.xlabel("Epoch")
    plt.ylabel("Loss")
    plt.legend()

    # Plot F1 Score
    plt.subplot(2, 2, 3)
    plt.plot(h["f1_score"], label="Train F1")
    plt.plot(h["val_f1_score"], label="Val F1")
    plt.title("F1 Score")
    plt.xlabel("Epoch")
    plt.ylabel("F1 Score")
    plt.legend()

    # Plot Sensitivity and Specificity
    plt.subplot(2, 2, 4)
    plt.plot(h["sensitivity"], label="Train Sensitivity")
    plt.plot(h["val_sensitivity"], label="Val Sensitivity")
    plt.plot(h["specificity"], label="Train Specificity")
    plt.plot(h["val_specificity"], label="Val Specificity")
    plt.title("Sensitivity and Specificity")
    plt.xlabel("Epoch")
    plt.ylabel("Score")
    plt.legend()

    plt.tight_layout()
    plt.show()

    # Print final metrics
    print("\nFinal Metrics:")
    print(f"Accuracy: {h['val_accuracy'][-1]:.4f}")
    print(f"F1 Score: {h['val_f1_score'][-1]:.4f}")
    print(f"Sensitivity: {h['val_sensitivity'][-1]:.4f}")
    print(f"Specificity: {h['val_specificity'][-1]:.4f}")
    print(f"Precision: {h['val_precision'][-1]:.4f}")
    print(f"Recall: {h['val_recall'][-1]:.4f}")

    # Save the complete history to a separate file for later use
    history_file = os.path.join(MODEL_SAVE_DIR, f"complete_history_{split}.pkl")
    with open(history_file, "wb") as f:
        pickle.dump(h, f)
    print(f"\nComplete training history saved to: {history_file}")


if __name__ == "__main__":
    splits = ["90-10"]
    for s in splits:
        last_ckpt = os.path.join(MODEL_SAVE_DIR, f"last_model_{s}.h5")
        if os.path.exists(last_ckpt):
            ans = (
                input(f"Found existing checkpoint for '{s}'. Resume? (y/n): ")
                .strip()
                .lower()
            )
            resume_flag = ans in ("y", "yes", "1", "true")
        else:
            resume_flag = False
        train_model(s, resume_flag)
    print("All training finished!")
