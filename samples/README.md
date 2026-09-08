# Repair samples

[Mug cap](mug-cap/manifest.json) contains the user's four supplied mug photographs,
named by their useful view. Files are exact copies; the original `.upload/` files
remain unchanged. Each manifest entry records its original filename and SHA-256.
No real dimensions or annotations have been inferred from the photograph names.

The main app's **Try the mug cap** action creates a separate saved repair and
sends these photos through the ordinary upload and ACP image-input path. They
are not synthetic chat records. The sample prompt asks the agent for measurements;
the user supplies actual caliper values before relying on physical dimensions.

See [main experience contract](../docs/M-REPAIR.md). Backend sample routes expose
only this manifest's named images, not the incoming upload directory or local paths.
