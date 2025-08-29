#!/usr/bin/env python3
"""
Local embedding service using sentence-transformers
Standalone Python script for generating embeddings without external API calls
"""

import sys
import json
import numpy as np
from pathlib import Path
import argparse
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def install_requirements():
    """Install required packages if not available"""
    import subprocess
    
    required_packages = [
        'sentence-transformers',
        'torch',
        'numpy'
    ]
    
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            logger.info(f"Installing {package}...")
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', package])

def load_model(model_name='sentence-transformers/all-MiniLM-L6-v2'):
    """Load the sentence transformer model"""
    try:
        from sentence_transformers import SentenceTransformer
        logger.info(f"Loading model: {model_name}")
        model = SentenceTransformer(model_name)
        logger.info(f"Model loaded successfully. Dimension: {model.get_sentence_embedding_dimension()}")
        return model
    except Exception as e:
        logger.error(f"Error loading model: {e}")
        return None

def create_embeddings(texts, model):
    """Generate embeddings for a list of texts"""
    try:
        logger.info(f"Creating embeddings for {len(texts)} texts...")
        embeddings = model.encode(texts, convert_to_tensor=False, normalize_embeddings=True)
        
        # Convert to list for JSON serialization
        if hasattr(embeddings, 'tolist'):
            embeddings = embeddings.tolist()
        
        logger.info(f"Generated {len(embeddings)} embeddings")
        return embeddings
    except Exception as e:
        logger.error(f"Error creating embeddings: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description='Local Embedding Service')
    parser.add_argument('--model', default='sentence-transformers/all-MiniLM-L6-v2', help='Model name')
    parser.add_argument('--install', action='store_true', help='Install required packages')
    parser.add_argument('--text', help='Single text to embed')
    parser.add_argument('--batch', help='JSON file with batch of texts')
    parser.add_argument('--output', help='Output file for embeddings')
    
    args = parser.parse_args()
    
    if args.install:
        install_requirements()
        return
    
    # Load model
    model = load_model(args.model)
    if not model:
        sys.exit(1)
    
    # Process input
    texts = []
    if args.text:
        texts = [args.text]
    elif args.batch:
        try:
            with open(args.batch, 'r', encoding='utf-8') as f:
                batch_data = json.load(f)
                texts = batch_data.get('texts', [])
        except Exception as e:
            logger.error(f"Error reading batch file: {e}")
            sys.exit(1)
    else:
        # Read from stdin
        try:
            input_data = json.loads(sys.stdin.read())
            texts = input_data.get('texts', [])
        except Exception as e:
            logger.error(f"Error reading from stdin: {e}")
            sys.exit(1)
    
    if not texts:
        logger.error("No texts provided")
        sys.exit(1)
    
    # Generate embeddings
    embeddings = create_embeddings(texts, model)
    if embeddings is None:
        sys.exit(1)
    
    # Output results
    result = {
        'embeddings': embeddings,
        'model': args.model,
        'dimension': model.get_sentence_embedding_dimension(),
        'count': len(embeddings)
    }
    
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(result, f)
        logger.info(f"Embeddings saved to {args.output}")
    else:
        print(json.dumps(result))

if __name__ == '__main__':
    main()
