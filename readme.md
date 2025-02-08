# Game of immortal lifeforms
A set of free to mint tokens that can be created by solving puzzles on chain and offchain

## A lifeform repertory

I am creating a repertory of « alive » [game of life](https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life) patterns. If you can identify a game of life pattern that is looping,it means it’s « alive ». You then submit it on chain and the script will verify that it is indeed looping before letting you mint the associated ERC721 token.

For very long loops,you’ll be able to generate a proof off chain and use that to mint your token.

## General roadamp
- First I want to prove loops
- Then I’ll want to prove « life » or « death »
- Any gol grid is either leading to life (a loop) or death (an empty loop)
- You can then let people mint tokens if and only if they prove where their grid leads.
- You’ll get generative NFTs that will have oroperties based on how far they are from hell or Valhalla

Also the cool thing is:
You can actually put the full art on chain. No need for ipfs.
A single us render can display any nft as long  as you seed it with the initial grid

Now where I want to plug in erc20s and 1155.
Technically those loop life forms can live forever. People can just move them along. Like the wind for [Theo Jansen’s sculpture](https://www.strandbeest.com/).

How do you incentivize people to do that?

Well,you create an erc20 that is required to pay for the minting of the new loops.
That erc20 is mintable if you « move a loop forward » - breath life into it,mint the erc20,mint your loop.

Each NFT is a 15x15 grid so that you can pack the grid in a single felt.
Sounds small?
Think about it. That is 2^225 combinations already - it’s pretty huge

## To do list
### Done
*Smart contracts* 
- Create game of life functions
- Create an ERC721 for infinite lifeforms
- Create a minter for infinite lifeforms

*Front end* 
- Simple UX to visualize lifeforms and look for alive patterns

### To do
*Smart contracts* 
- Create a minter for infinite lifeforms using client side proving
- Create a minter for dead / alive paths
- Create a minter for dead / alive paths using client side proving
- Create an ERC20
- Create a minter for breathing life into lifeforms
- Store js render on chain
- Write a bunch of tests
- Write a deployment script

*Front end* 
- Simple UX to see existing lifeforms
- Simple UX to mint lifeforms

### Notes
- Cairo steps per generation roughly 115k
- Max generations in a single tx: 90
