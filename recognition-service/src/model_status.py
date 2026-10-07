import json
import os

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASELINE_JSON = os.path.join(PROJECT_ROOT, "baseline_results.json")

def get_model_status(aggregator):
    stats = {}
    if os.path.exists(BASELINE_JSON):
        try:
            with open(BASELINE_JSON, 'r') as f:
                data = json.load(f)
                if "stats" in data:
                    stats = data["stats"]
        except Exception:
            pass

    models = []
    
    # ensure all detectors configured in the aggregator are reported
    for inst_name, detector in aggregator.detectors.items():
        trained = detector.model_available
        # Try to pull F1/accuracy from stats if it exists
        accuracy = None
        if trained and inst_name in stats:
             # avg_score from baseline as accuracy proxy
             accuracy = round(stats[inst_name].get("avg_score", 0.0) * 100, 1)
        
        models.append({
            "instrument": inst_name,
            "trained": trained,
            "accuracy": accuracy,
            "model_path": detector.checkpoint_info if trained else "none"
        })
        
    return {"models": models}
