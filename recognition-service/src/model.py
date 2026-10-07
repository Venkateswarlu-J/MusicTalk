import torch
import torch.nn as nn


class InstrumentCNN(nn.Module):
    """
    Binary instrument detector CNN.

    Architecture:
      Block 1: Conv2d(1->16, kernel=3, padding=1) -> BatchNorm2d(16) -> ReLU -> MaxPool2d(2, 2)
      Block 2: Conv2d(16->32, kernel=3, padding=1) -> BatchNorm2d(32) -> ReLU -> MaxPool2d(2, 2)
      Block 3: Conv2d(32->64, kernel=3, padding=1) -> BatchNorm2d(64) -> ReLU -> MaxPool2d(2, 2)
      AdaptiveAvgPool2d((4, 4))
      Flatten -> 64 * 4 * 4 = 1024
      FC1: Linear(1024, 64) -> ReLU -> Dropout(0.3)
      FC2: Linear(64, 1) -> Raw logit output

    NOTE ON ARCHITECTURE SWAP-OUT POINT:
    ======================================
    The original MusicTalk IEEE paper (Lin, Cheng, Chiu, 2024) employs an ensemble
    combining a pre-trained ResNet38 CNN with a Vision Transformer (ViT) featuring
    a custom 'Brightness Characteristic Based Patchout' mechanism, fused via a linear layer.
    For this implementation milestone, this simpler InstrumentCNN is used as the binary detector.
    To upgrade to the full ensemble model, swap this class definition with the ResNet38+ViT
    ensemble while keeping the input shape (1, 128, 130) and output logit contract intact.
    """

    def __init__(self, dropout_rate: float = 0.3):
        super(InstrumentCNN, self).__init__()

        # Conv Block 1: (1, 128, 130) -> (16, 64, 65)
        self.block1 = nn.Sequential(
            nn.Conv2d(1, 16, kernel_size=3, padding=1),
            nn.BatchNorm2d(16),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2)
        )

        # Conv Block 2: (16, 64, 65) -> (32, 32, 32)
        self.block2 = nn.Sequential(
            nn.Conv2d(16, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2)
        )

        # Conv Block 3: (32, 32, 32) -> (64, 16, 16)
        self.block3 = nn.Sequential(
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2)
        )

        # Adaptive pooling to fixed spatial grid: (64, 4, 4)
        self.adaptive_pool = nn.AdaptiveAvgPool2d((4, 4))

        # Classifier head: 64 * 4 * 4 = 1024 -> 64 -> 1
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64 * 4 * 4, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(p=dropout_rate),
            nn.Linear(64, 1)  # Raw logit for BCEWithLogitsLoss
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Input: (Batch, 1, 128, 130)
        Output: (Batch, 1) raw logits
        """
        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        x = self.adaptive_pool(x)
        logits = self.classifier(x)
        return logits
