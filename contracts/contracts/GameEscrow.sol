// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract GameEscrow {
    struct Match {
        address player1;
        address player2;
        uint256 betAmount;
        bool isActive;
        address winner;
    }

    address public owner;
    uint256 public matchCount;
    mapping(uint256 => Match) public matches;

    constructor() {
        owner = msg.sender;
    }

    event MatchCreated(uint256 indexed matchId, address indexed player1, address indexed player2, uint256 betAmount);
    event MatchSettled(uint256 indexed matchId, address winner);

    // Player1 creează meciul și mizează
    function createMatch(address _player2) external payable {
        require(msg.value > 0, "Bet amount must be greater than 0");
        require(_player2 != msg.sender, "You cannot play against yourself");

        matches[matchCount] = Match({
            player1: msg.sender,
            player2: _player2,
            betAmount: msg.value,
            isActive: true,
            winner: address(0)
        });

        emit MatchCreated(matchCount, msg.sender, _player2, msg.value);
        matchCount++;
    }

    // Player2 intră în joc și mizează la fel
    function joinMatch(uint256 _matchId) external payable {
        Match storage m = matches[_matchId];
        require(m.isActive, "Match not active");
        require(msg.sender == m.player2, "Not invited");
        require(msg.value == m.betAmount, "Must send equal bet");

        // ambii jucători au mizat — meciul e valid
    }

    // Doar owner-ul (adminul) poate decide câștigătorul
    function settleMatch(uint256 _matchId, address _winner) external {
        Match storage m = matches[_matchId];
        require(msg.sender == owner, "Only owner can settle match");
        require(m.isActive, "Match already settled");
        require(_winner == m.player1 || _winner == m.player2, "Invalid winner");

        m.isActive = false;
        m.winner = _winner;

        payable(_winner).transfer(address(this).balance);

        emit MatchSettled(_matchId, _winner);
    }
    function getMatches() public view returns (Match[] memory) {
    Match[] memory allMatches = new Match[](matchCount);
    for (uint256 i = 0; i < matchCount; i++) {
        allMatches[i] = matches[i];
    }
    return allMatches;
    }

}
