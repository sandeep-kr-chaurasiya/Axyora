"""
image_captioner.py - Axyora Semantic Image Understanding
Uses Salesforce BLIP (Bootstrapping Language-Image Pre-training) 
to generate descriptive captions and tags for images.
"""

import io
import torch
from PIL import Image
from transformers import BlipProcessor, BlipForConditionalGeneration
from logging_config import logger
from production_config import (
    CAPTIONING_MODEL,
    IMAGE_MAX_DIM,
    IMAGE_CAPTION_MAX_NEW_TOKENS,
)

_captioner_instance = None

def get_captioner():
    global _captioner_instance
    if _captioner_instance is None:
        _captioner_instance = ImageCaptioner()
    return _captioner_instance

class ImageCaptioner:
    def __init__(self, model_id=CAPTIONING_MODEL):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        # Support for Apple Silicon (MPS)
        if torch.backends.mps.is_available():
            self.device = "mps"
            
        logger.info(f"[ImageAI] Initializing {model_id} on {self.device}")
        
        self.processor = BlipProcessor.from_pretrained(model_id)
        self.model = BlipForConditionalGeneration.from_pretrained(model_id).to(self.device)
        self.model.eval()
        self.model_id = model_id
        
        logger.info("[ImageAI] Captioning model loaded successfully")

    def generate_caption(self, image_bytes: bytes, filename: str) -> dict:
        """
        Generates a semantic caption and tags for an image.
        """
        try:
            if filename.lower().endswith(".heic"):
                try:
                    from pillow_heif import register_heif_opener
                    register_heif_opener()
                except Exception:
                    pass

            image = Image.open(io.BytesIO(image_bytes))
            if image.mode != "RGB":
                image = image.convert("RGB")

            # Downscale very large images to reduce inference latency and memory usage.
            if max(image.width, image.height) > IMAGE_MAX_DIM:
                ratio = IMAGE_MAX_DIM / max(image.width, image.height)
                image = image.resize(
                    (int(image.width * ratio), int(image.height * ratio)),
                    Image.Resampling.LANCZOS,
                )

            # Prepare image for the model
            inputs = self.processor(image, return_tensors="pt").to(self.device)

            # Generate caption
            with torch.inference_mode():
                out = self.model.generate(
                    **inputs,
                    max_new_tokens=IMAGE_CAPTION_MAX_NEW_TOKENS,
                    num_beams=1,
                    do_sample=False,
                )
            caption = self.processor.decode(out[0], skip_special_tokens=True)

            # Simple tag extraction from caption (naive but effective for local)
            # In a production app, we might use a dedicated tagger or the LLM
            common_stopwords = {"a", "an", "the", "of", "in", "with", "on", "at", "by", "is", "are"}
            tags = [
                word.strip(".,!?") 
                for word in caption.lower().split() 
                if len(word) > 2 and word not in common_stopwords
            ]

            return {
                "caption": caption,
                "tags": list(set(tags)),
                "model": self.model_id,
                "confidence": 0.95, # Placeholder for model confidence
                "filename": filename
            }

        except Exception as e:
            logger.error(f"[ImageAI] Captioning failed for {filename}", error=e)
            raise e
