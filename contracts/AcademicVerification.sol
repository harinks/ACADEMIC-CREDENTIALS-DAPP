// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AcademicCredentials
 * @dev Universities issue, revoke, and anyone can verify credentials by hash.
 */
contract AcademicCredentials {
    // Admin (university) address
    address public admin;

    // Credential data structure
    struct Credential {
        string name;        // Student name
        string university;  // University name
        string degree;      // Degree title
        string field;       // Field of study
        address student;    // Student wallet address
        bool revoked;       // Revocation status
        bool exists;        // To check if credential exists
    }

    // Mapping from credential hash to Credential
    mapping(bytes32 => Credential) private credentials;

    // Events
    event CredentialIssued(
        bytes32 indexed credentialHash,
        address indexed student,
        string name,
        string university,
        string degree,
        string field
    );

    event CredentialRevoked(bytes32 indexed credentialHash);
    event CredentialUnrevoked(bytes32 indexed credentialHash);

    // Modifiers
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /**
     * @dev Issue a new credential. Only admin (university) can call.
     * @param _student Student wallet address
     * @param _name Student name
     * @param _university University name
     * @param _degree Degree title
     * @param _field Field of study
     * @return credentialHash Unique hash for this credential
     */
    function issueCredential(
        address _student,
        string memory _name,
        string memory _university,
        string memory _degree,
        string memory _field
    ) public onlyAdmin returns (bytes32 credentialHash) {
        // Create a unique hash (you can tweak this formula if you like)
        credentialHash = keccak256(
            abi.encodePacked(
                _student,
                _name,
                _university,
                _degree,
                _field,
                block.timestamp
            )
        );

        require(!credentials[credentialHash].exists, "Credential already exists");

        credentials[credentialHash] = Credential({
            name: _name,
            university: _university,
            degree: _degree,
            field: _field,
            student: _student,
            revoked: false,
            exists: true
        });

        emit CredentialIssued(
            credentialHash,
            _student,
            _name,
            _university,
            _degree,
            _field
        );
    }

    /**
     * @dev Get full credential data by hash.
     */
    function getCredential(bytes32 _credentialHash)
        public
        view
        returns (
            string memory name,
            string memory university,
            string memory degree,
            string memory field,
            address student,
            bool revoked,
            bool exists
        )
    {
        Credential memory c = credentials[_credentialHash];
        return (
            c.name,
            c.university,
            c.degree,
            c.field,
            c.student,
            c.revoked,
            c.exists
        );
    }

    /**
     * @dev Revoke a credential. Only admin can revoke.
     */
    function revokeCredential(bytes32 _credentialHash) public onlyAdmin {
        require(credentials[_credentialHash].exists, "Credential does not exist");
        require(!credentials[_credentialHash].revoked, "Already revoked");

        credentials[_credentialHash].revoked = true;
        emit CredentialRevoked(_credentialHash);
    }

    /**
     * @dev Unrevoke a credential. Only admin can unrevoke.
     */
    function unrevokeCredential(bytes32 _credentialHash) public onlyAdmin {
        require(credentials[_credentialHash].exists, "Credential does not exist");
        require(credentials[_credentialHash].revoked, "Not revoked");

        credentials[_credentialHash].revoked = false;
        emit CredentialUnrevoked(_credentialHash);
    }

    /**
     * @dev Simple verification: returns true if exists and not revoked.
     */
    function verifyCredential(bytes32 _credentialHash) public view returns (bool) {
        Credential memory c = credentials[_credentialHash];
        return c.exists && !c.revoked;
    }
}