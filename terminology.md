`Grid` id is the id of a single frame of game of life. Function to compute a grid id are in the repo (js , cairo)
A `sequence` is either a path or a loop.
`Loops` are game of life patterns that repeat themselves forever.
They are identified by the smallest grid id in the sequence
A `path` is a sequence that starts at a grid and converges towards a loop. Their id is the first item in the sequence. 
A `sequence length `is the number if distinct element in a sequence. For a loop, it’s the number of grid ids that the loops goes through. For a path, it is the number of grid ids it goes through before entering a loop. The loop entrypoint is not counter in the length.
`Being dead` for a path / loop means that it leads to an empty grid - a grid of id 0
`Being alive` means leading to loop that is not 0
`The nutrient token` is used to breath life into bacterias, and create new ones. It is mintable for free using move_life_forward on an existing bacteria. Each call yields a single token. 
Creating a new bacteria / path requires as many wind tokens as the length of the sequence you’d like to create.