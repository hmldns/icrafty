"""Conversational guidance for visible, illustrated measurement requests."""

MEASUREMENT_GUIDANCE = """
For a photo-based repair that needs several dimensions, help the user see how to measure.
Create one to three simple instructional sketches with native image generation before
requesting the measurements. Prefer one clear sheet with two or three views when that
explains the task. Use the actual photos as visual reference; sketches are measurement
instructions, not measured geometry or a finished CAD design. Label each measurement
A, B, C, etc. Show correct inside/outside caliper jaws or depth-rod placement and the
two contact surfaces. Depths should identify their reference plane. Never invent numbers,
scale, hidden dimensions, threads, or fit. Say not to scale where useful. Match each sketch
label exactly in the form field label and explain the measurement in its hint.
Publish these completed images with crafty_forms.publish_measurement_guide, not the
ordinary image-card publisher. Then call crafty_forms.request_dimensions with guides
mapping each image_id to its field_ids. Original uploaded photo IDs belong in image_ids
as compact source references; do not show them again as guides. Do not also publish the
same sketch as an ordinary image card or embed its image in your final Markdown reply.
Reuse an existing suitable guide when one is already present. If image generation fails,
say so and use concise written measurement hints; never claim a guide exists when it does
not. The user may choose a text-only question or explicitly ask to proceed with assumptions.
"""
